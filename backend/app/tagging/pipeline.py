"""Auto-tagging orchestrator.

Hard gate: only runs on assets with mapping_status in {VERIFIED, MANUALLY_CONFIRMED}.
"""
from __future__ import annotations

import logging
from datetime import datetime
from pathlib import Path

from sqlalchemy.orm import Session

from app.config import settings
from app.db.models import AdReference, Asset, AutoTag, MappingStatus, TagStatus
from app.db.session import SessionLocal
from app.tagging.audio import extract_audio_wav, transcribe_whisper
from app.tagging.frames import ExtractedFrame, extract_frames, extract_single_image
from app.tagging.vision import tag_with_claude

log = logging.getLogger(__name__)

ALLOWED_MAPPING_STATUSES = {
    MappingStatus.VERIFIED.value,
    MappingStatus.MANUALLY_CONFIRMED.value,
}


def _can_tag(asset: Asset) -> tuple[bool, str | None]:
    if asset.mapping_status not in ALLOWED_MAPPING_STATUSES:
        return False, f"blocked: mapping_status={asset.mapping_status}"
    if asset.download_status != "downloaded":
        return False, f"blocked: download_status={asset.download_status}"
    if not asset.storage_path or not Path(asset.storage_path).exists():
        return False, "blocked: storage_path missing"
    return True, None


def tag_asset(asset_id: str) -> dict:
    """Run the full auto-tag pipeline for a single asset. Idempotent."""
    session: Session = SessionLocal()
    try:
        asset = session.get(Asset, asset_id)
        if asset is None:
            return {"ok": False, "error": "asset_not_found"}

        ok, reason = _can_tag(asset)
        if not ok:
            return {"ok": False, "asset_id": asset_id, "skipped": True, "reason": reason}

        # If already tagged, return existing
        existing = session.query(AutoTag).filter_by(asset_id=asset_id).first()
        if existing:
            return {
                "ok": True,
                "asset_id": asset_id,
                "skipped": True,
                "reason": "already_tagged",
                "tag_id": existing.id,
            }

        storage_path = Path(asset.storage_path)
        actual_duration = asset.actual_duration_seconds or 0.0

        # Frame extraction
        if asset.asset_type == "image":
            frames = extract_single_image(storage_path, asset_id=asset_id)
            transcript_text = ""
            transcript_language = None
            transcript_cost = 0.0
        else:
            frames = extract_frames(
                storage_path,
                asset_id=asset_id,
                actual_duration=actual_duration,
            )
            # Audio extraction + Whisper
            audio_dir = settings.frames_dir / asset_id
            audio_dir.mkdir(parents=True, exist_ok=True)
            audio_path = audio_dir / "audio.wav"
            transcript_text = ""
            transcript_language = None
            transcript_cost = 0.0
            if extract_audio_wav(storage_path, out_path=audio_path):
                tx = transcribe_whisper(audio_path)
                transcript_text = tx.text
                transcript_language = tx.language
                transcript_cost = tx.cost_inr

        if not frames:
            return {"ok": False, "asset_id": asset_id, "error": "no_frames_extracted"}

        # Look up the primary Hawky ad name for reference (not authoritative)
        ad_ref = (
            session.query(AdReference).filter_by(asset_id=asset_id).order_by(AdReference.id).first()
        )
        hawky_ad_name = ad_ref.ad_name if ad_ref else None

        # Claude vision tagging
        result = tag_with_claude(
            frames=frames,
            transcript=transcript_text,
            actual_duration_seconds=actual_duration,
            asset_type=asset.asset_type,
            hawky_ad_name=hawky_ad_name,
        )

        if result.error or not result.parsed:
            return {
                "ok": False,
                "asset_id": asset_id,
                "error": result.error or "empty_parse",
                "raw": result.raw_response[:500] if result.raw_response else None,
            }

        p = result.parsed
        confidence = (p.get("_confidence") or {}) if isinstance(p.get("_confidence"), dict) else {}

        product_reveal_pct = None
        prs = p.get("product_reveal_second")
        if prs is not None and actual_duration > 0:
            try:
                product_reveal_pct = float(prs) / actual_duration
            except (TypeError, ValueError):
                product_reveal_pct = None

        tag = AutoTag(
            asset_id=asset_id,
            sku=p.get("sku"),
            sku_confidence=confidence.get("sku") or p.get("sku_confidence"),
            campaign=p.get("campaign"),
            format=p.get("format"),
            hook_archetype=p.get("hook_archetype"),
            hook_mechanic=p.get("hook_mechanic"),
            opening_subject=p.get("opening_subject"),
            on_screen_text=p.get("on_screen_text"),
            audio_type=p.get("audio_type"),
            audio_language=p.get("audio_language") or transcript_language,
            persona_implied=p.get("persona_implied"),
            pain_addressed=p.get("pain_addressed"),
            awareness_stage=p.get("awareness_stage"),
            angle=p.get("angle"),
            brand_visible_first_3s=p.get("brand_visible_first_3s"),
            product_reveal_second=p.get("product_reveal_second"),
            product_reveal_pct=product_reveal_pct,
            talent_type=p.get("talent_type"),
            setting=p.get("setting"),
            color_palette=p.get("color_palette"),
            follows_60pct_rule=p.get("follows_60pct_rule"),
            audio_transcript=transcript_text or None,
            status=TagStatus.AUTO.value,
            model_version=result.model,
            raw_response=result.raw_response,
            tagging_cost_inr=round(result.cost_inr + transcript_cost, 4),
            created_at=datetime.utcnow(),
        )
        session.add(tag)
        session.commit()

        return {
            "ok": True,
            "asset_id": asset_id,
            "tag_id": tag.id,
            "cost_inr": tag.tagging_cost_inr,
            "sku": tag.sku,
            "hook_archetype": tag.hook_archetype,
        }
    except Exception as e:
        session.rollback()
        log.exception("tag_asset failed for %s", asset_id)
        return {"ok": False, "asset_id": asset_id, "error": str(e)}
    finally:
        session.close()


def tag_all_pending(limit: int | None = None, progress_cb=None) -> dict:
    """Tag every asset that is eligible and not yet tagged.

    If progress_cb is provided, it is called after each asset with a dict:
    {done, total, ok, failed, cost_inr, last_asset_id, last_sku, last_archetype}.
    """
    session = SessionLocal()
    try:
        q = (
            session.query(Asset.asset_id)
            .outerjoin(AutoTag, AutoTag.asset_id == Asset.asset_id)
            .filter(Asset.mapping_status.in_(list(ALLOWED_MAPPING_STATUSES)))
            .filter(Asset.download_status == "downloaded")
            .filter(AutoTag.id.is_(None))
        )
        if limit:
            q = q.limit(limit)
        ids = [row[0] for row in q.all()]
    finally:
        session.close()

    summary = {"total": len(ids), "ok": 0, "failed": 0, "cost_inr": 0.0, "failures": []}
    for idx, asset_id in enumerate(ids, start=1):
        res = tag_asset(asset_id)
        if res.get("ok"):
            summary["ok"] += 1
            summary["cost_inr"] += res.get("cost_inr", 0.0)
        else:
            summary["failed"] += 1
            summary["failures"].append({"asset_id": asset_id, "error": res.get("error")})

        if progress_cb:
            try:
                progress_cb(
                    {
                        "done": idx,
                        "total": len(ids),
                        "ok": summary["ok"],
                        "failed": summary["failed"],
                        "cost_inr": round(summary["cost_inr"], 4),
                        "last_asset_id": asset_id,
                        "last_sku": res.get("sku"),
                        "last_archetype": res.get("hook_archetype"),
                    }
                )
            except Exception:
                pass

    summary["cost_inr"] = round(summary["cost_inr"], 4)
    return summary
