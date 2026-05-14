from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from app.api.schemas import AssetSummary
from app.db.models import AdReference, Asset, AutoTag, PerformanceRow
from app.db.session import get_db

router = APIRouter(prefix="/assets", tags=["assets"])


def _aggregate_perf_row(perf_rows: list[PerformanceRow]) -> dict:
    """Aggregate metrics across all performance rows for an asset.
    Spend sums; rates are spend-weighted; ROAS is spend-weighted."""
    if not perf_rows:
        return {}
    total_spend = sum((p.spend or 0) for p in perf_rows)
    total_impr = sum((p.impressions or 0) for p in perf_rows)
    total_clicks = sum((p.clicks or 0) for p in perf_rows)

    def _weighted(field: str) -> float | None:
        weight = 0.0
        accum = 0.0
        for p in perf_rows:
            v = getattr(p, field, None)
            s = p.spend or 0
            if v is None or s == 0:
                continue
            accum += float(v) * s
            weight += s
        return accum / weight if weight > 0 else None

    return {
        "spend": total_spend or None,
        "impressions": total_impr or None,
        "clicks": total_clicks or None,
        "hook_rate": _weighted("hook_rate"),
        "hold_rate": _weighted("hold_rate"),
        "ctr": _weighted("ctr"),
        "roas": _weighted("roas"),
    }


@router.get("", response_model=list[AssetSummary])
def list_assets(
    db: Session = Depends(get_db),
    sku: str | None = None,
    hook_archetype: str | None = None,
    format: str | None = None,
    audio_language: str | None = None,
    persona_implied: str | None = None,
    awareness_stage: str | None = None,
    talent_type: str | None = None,
    setting: str | None = None,
    brand_visible_first_3s: bool | None = None,
    follows_60pct_rule: bool | None = None,
    asset_type: str | None = None,  # 'video' | 'image'
    mapping_status: str | None = None,
    min_spend: float | None = None,
    min_roas: float | None = None,
    min_hook_rate: float | None = None,
    search: str | None = None,
    sort_by: str = Query("spend", description="spend | roas | hook_rate | hold_rate | ctr | created_at"),
    sort_dir: str = Query("desc"),
    limit: int = Query(200, le=1000),
    offset: int = 0,
):
    """Return a paginated list of assets with aggregated stats + autotag fields."""
    q = db.query(Asset)
    if mapping_status:
        q = q.filter(Asset.mapping_status == mapping_status)
    if asset_type:
        q = q.filter(Asset.asset_type == asset_type)

    needs_tag_join = any(
        x is not None and x != ""
        for x in [sku, hook_archetype, format, audio_language, persona_implied,
                  awareness_stage, talent_type, setting, brand_visible_first_3s,
                  follows_60pct_rule]
    )
    if needs_tag_join:
        q = q.join(AutoTag, AutoTag.asset_id == Asset.asset_id)
        if sku:
            q = q.filter(AutoTag.sku == sku)
        if hook_archetype:
            q = q.filter(AutoTag.hook_archetype == hook_archetype)
        if format:
            q = q.filter(AutoTag.format == format)
        if audio_language:
            q = q.filter(AutoTag.audio_language == audio_language)
        if persona_implied:
            q = q.filter(AutoTag.persona_implied == persona_implied)
        if awareness_stage:
            q = q.filter(AutoTag.awareness_stage == awareness_stage)
        if talent_type:
            q = q.filter(AutoTag.talent_type == talent_type)
        if setting:
            q = q.filter(AutoTag.setting == setting)
        if brand_visible_first_3s is not None:
            q = q.filter(AutoTag.brand_visible_first_3s == brand_visible_first_3s)
        if follows_60pct_rule is not None:
            q = q.filter(AutoTag.follows_60pct_rule == follows_60pct_rule)

    assets = q.all()

    out: list[AssetSummary] = []
    for asset in assets:
        perf = _aggregate_perf_row(asset.performance_rows)

        # Apply numeric filters in-Python over aggregates
        if min_spend is not None and (perf.get("spend") or 0) < min_spend:
            continue
        if min_roas is not None and (perf.get("roas") or 0) < min_roas:
            continue
        if min_hook_rate is not None and (perf.get("hook_rate") or 0) < min_hook_rate:
            continue

        ad_ref = asset.ad_refs[0] if asset.ad_refs else None
        if search:
            s = search.lower()
            haystack = " ".join(
                filter(
                    None,
                    [
                        asset.asset_id,
                        (ad_ref.ad_name if ad_ref else None),
                        (ad_ref.ad_id if ad_ref else None),
                        (asset.autotag.on_screen_text if asset.autotag else None),
                        (asset.autotag.audio_transcript if asset.autotag else None),
                    ],
                )
            ).lower()
            if s not in haystack:
                continue

        out.append(
            AssetSummary(
                asset_id=asset.asset_id,
                asset_type=asset.asset_type,
                storage_path=asset.storage_path,
                mapping_status=asset.mapping_status,
                mapping_resolution_note=asset.mapping_resolution_note,
                actual_duration_seconds=asset.actual_duration_seconds,
                actual_width=asset.actual_width,
                actual_height=asset.actual_height,
                size_bytes=asset.size_bytes,
                download_status=asset.download_status,
                concept_id=asset.concept_id,
                primary_ad_id=ad_ref.ad_id if ad_ref else None,
                primary_ad_name=ad_ref.ad_name if ad_ref else None,
                spend=perf.get("spend"),
                impressions=perf.get("impressions"),
                hook_rate=perf.get("hook_rate"),
                hold_rate=perf.get("hold_rate"),
                ctr=perf.get("ctr"),
                roas=perf.get("roas"),
                clicks=perf.get("clicks"),
                sku=asset.autotag.sku if asset.autotag else None,
                format=asset.autotag.format if asset.autotag else None,
                hook_archetype=asset.autotag.hook_archetype if asset.autotag else None,
                persona_implied=asset.autotag.persona_implied if asset.autotag else None,
                awareness_stage=asset.autotag.awareness_stage if asset.autotag else None,
                talent_type=asset.autotag.talent_type if asset.autotag else None,
                audio_language=asset.autotag.audio_language if asset.autotag else None,
                on_screen_text=asset.autotag.on_screen_text if asset.autotag else None,
                brand_visible_first_3s=asset.autotag.brand_visible_first_3s if asset.autotag else None,
                follows_60pct_rule=asset.autotag.follows_60pct_rule if asset.autotag else None,
                sku_confidence=asset.autotag.sku_confidence if asset.autotag else None,
            )
        )

    # Sort
    reverse = sort_dir.lower() != "asc"

    def _sort_key(a: AssetSummary):
        val = getattr(a, sort_by, None)
        if val is None:
            return float("-inf") if reverse else float("inf")
        return val

    out.sort(key=_sort_key, reverse=reverse)
    return out[offset : offset + limit]


@router.get("/{asset_id}/download")
def download_asset(asset_id: str, db: Session = Depends(get_db)):
    """US-2.10: download the asset with the YOSO naming convention."""
    asset = db.get(Asset, asset_id)
    if not asset or not asset.storage_path:
        raise HTTPException(404, "not_found")
    path = Path(asset.storage_path)
    if not path.exists():
        raise HTTPException(404, "file_missing")
    ad = asset.ad_refs[0] if asset.ad_refs else None
    sku_tag = (asset.autotag.sku if asset.autotag else None) or "UNTAGGED"
    sku_safe = sku_tag.replace(" ", "-").replace("@", "at").replace("/", "-")
    concept = asset.concept_id or "Cxxx"
    primary_ad = ad.ad_id if ad else "noad"
    download_name = f"{asset.asset_id}__{primary_ad}__{sku_safe}__{concept}__v1{path.suffix}"
    return FileResponse(path, filename=download_name)


@router.get("/_counts")
def get_counts(db: Session = Depends(get_db)):
    total = db.query(Asset).count()
    by_type = {
        row[0]: row[1]
        for row in db.query(Asset.asset_type, func.count(Asset.asset_id))
        .group_by(Asset.asset_type)
        .all()
    }
    tagged = db.query(AutoTag).count()
    return {"total": total, "by_type": by_type, "tagged": tagged}


@router.get("/{asset_id}")
def get_asset(asset_id: str, db: Session = Depends(get_db)):
    asset = db.get(Asset, asset_id)
    if asset is None:
        raise HTTPException(404, "asset_not_found")

    perf = _aggregate_perf_row(asset.performance_rows)
    return {
        "asset_id": asset.asset_id,
        "file_hash": asset.file_hash,
        "mapping_key": asset.mapping_key,
        "asset_type": asset.asset_type,
        "mime_type": asset.mime_type,
        "actual_duration_seconds": asset.actual_duration_seconds,
        "actual_width": asset.actual_width,
        "actual_height": asset.actual_height,
        "size_bytes": asset.size_bytes,
        "mapping_status": asset.mapping_status,
        "mapping_resolution_note": asset.mapping_resolution_note,
        "download_status": asset.download_status,
        "concept_id": asset.concept_id,
        "performance_aggregate": perf,
        "performance_rows": [
            {
                "month_tag": p.month_tag,
                "ad_id": p.ad_id,
                "spend": p.spend,
                "impressions": p.impressions,
                "hook_rate": p.hook_rate,
                "hold_rate": p.hold_rate,
                "ctr": p.ctr,
                "roas": p.roas,
                "clicks": p.clicks,
                "atc": p.atc,
            }
            for p in asset.performance_rows
        ],
        "ad_references": [
            {"ad_id": r.ad_id, "ad_name": r.ad_name, "hawky_sku_implied": r.hawky_sku_implied}
            for r in asset.ad_refs
        ],
        "autotag": (
            {
                "sku": asset.autotag.sku,
                "sku_confidence": asset.autotag.sku_confidence,
                "campaign": asset.autotag.campaign,
                "format": asset.autotag.format,
                "hook_archetype": asset.autotag.hook_archetype,
                "hook_mechanic": asset.autotag.hook_mechanic,
                "opening_subject": asset.autotag.opening_subject,
                "on_screen_text": asset.autotag.on_screen_text,
                "audio_type": asset.autotag.audio_type,
                "audio_language": asset.autotag.audio_language,
                "persona_implied": asset.autotag.persona_implied,
                "pain_addressed": asset.autotag.pain_addressed,
                "awareness_stage": asset.autotag.awareness_stage,
                "angle": asset.autotag.angle,
                "brand_visible_first_3s": asset.autotag.brand_visible_first_3s,
                "product_reveal_second": asset.autotag.product_reveal_second,
                "product_reveal_pct": asset.autotag.product_reveal_pct,
                "talent_type": asset.autotag.talent_type,
                "setting": asset.autotag.setting,
                "color_palette": asset.autotag.color_palette,
                "follows_60pct_rule": asset.autotag.follows_60pct_rule,
                "audio_transcript": asset.autotag.audio_transcript,
                "model_version": asset.autotag.model_version,
                "tagging_cost_inr": asset.autotag.tagging_cost_inr,
                "status": asset.autotag.status,
            }
            if asset.autotag
            else None
        ),
    }
