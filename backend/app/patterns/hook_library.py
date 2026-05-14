"""Hook Library (Module 10 / US-10.1, US-10.2, US-10.3).

Extracts a Hook record per verbal/on-screen unit from each auto-tagged asset.
Dedup is text-based (normalized lower-cased trim, >85% similarity collapses).

For verbal hooks, we take the first ~15 words of the audio transcript as the hook —
Whisper doesn't give us word-level timestamps unless we request verbose_json with
"word" granularity, so this is a pragmatic approximation of "spoken in first 0-7s".
"""
from __future__ import annotations

import logging
import re
from difflib import SequenceMatcher

from sqlalchemy.orm import Session

from app.db.models import Asset, AutoTag, Hook, HookType, PerformanceRow

log = logging.getLogger(__name__)


def _normalize(text: str) -> str:
    s = text.lower().strip()
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"[^\w\s]", "", s, flags=re.UNICODE)
    return s


def _verbal_hook_from_transcript(transcript: str | None, max_words: int = 15) -> str | None:
    if not transcript:
        return None
    t = transcript.strip()
    words = re.findall(r"\S+", t)
    if len(words) <= max_words:
        return t
    return " ".join(words[:max_words])


def _aggregate_perf(perfs: list[PerformanceRow]) -> tuple[float, float | None, float | None]:
    spend = sum((p.spend or 0) for p in perfs)
    if not spend:
        return 0.0, None, None
    roas = sum((p.roas or 0) * (p.spend or 0) for p in perfs) / spend
    hook = sum((p.hook_rate or 0) * (p.spend or 0) for p in perfs) / spend
    return round(spend, 2), round(roas, 3), round(hook, 4)


def _find_similar(session: Session, normalized: str, hook_type: str, threshold: float = 0.85) -> Hook | None:
    """Look for an existing hook with >threshold similarity. Cheap on small libraries;
    if we ever cross ~10k hooks, switch to MinHash."""
    candidates = (
        session.query(Hook)
        .filter(Hook.hook_type == hook_type)
        .filter(Hook.text_normalized.like(f"%{normalized[:30]}%"))
        .limit(200)
        .all()
    )
    for c in candidates:
        if SequenceMatcher(None, c.text_normalized, normalized).ratio() >= threshold:
            return c
    return None


def extract_hooks_for_asset(session: Session, asset_id: str) -> dict:
    asset = session.get(Asset, asset_id)
    if not asset or not asset.autotag:
        return {"ok": False, "reason": "asset_or_tag_missing"}

    tag: AutoTag = asset.autotag
    perfs = asset.performance_rows
    spend, roas, hook_rate = _aggregate_perf(perfs)

    created = 0
    reused = 0

    candidates = []
    if tag.on_screen_text and tag.on_screen_text.strip():
        candidates.append((HookType.ON_SCREEN.value, tag.on_screen_text.strip()))
    verbal = _verbal_hook_from_transcript(tag.audio_transcript)
    if verbal:
        candidates.append((HookType.VERBAL.value, verbal))

    for hook_type, text in candidates:
        normalized = _normalize(text)
        if not normalized:
            continue
        existing = _find_similar(session, normalized, hook_type)
        if existing:
            reused += 1
            # If this asset has stronger performance, update the cached parent stats
            # (the canonical record represents the strongest known version of this hook)
            if (spend or 0) > (existing.parent_spend or 0):
                existing.parent_spend = spend
                existing.parent_roas = roas
                existing.parent_hook_rate = hook_rate
                existing.source_asset_id = asset_id
            continue
        session.add(Hook(
            text=text,
            text_normalized=normalized,
            hook_type=hook_type,
            source_asset_id=asset_id,
            sku=tag.sku,
            hook_archetype=tag.hook_archetype,
            persona_implied=tag.persona_implied,
            language=tag.audio_language,
            parent_spend=spend,
            parent_roas=roas,
            parent_hook_rate=hook_rate,
            source="auto",
        ))
        created += 1

    session.commit()
    return {"ok": True, "asset_id": asset_id, "created": created, "reused": reused}


def rebuild_library(session: Session) -> dict:
    """Rebuild the hook library from all currently-tagged assets. Idempotent — re-runs
    dedupe and refresh parent stats."""
    asset_ids = [
        a.asset_id for a in session.query(Asset)
        .join(AutoTag, AutoTag.asset_id == Asset.asset_id)
        .filter(Asset.download_status == "downloaded").all()
    ]
    total_created = 0
    total_reused = 0
    failed = 0
    for aid in asset_ids:
        try:
            r = extract_hooks_for_asset(session, aid)
            total_created += r.get("created", 0)
            total_reused += r.get("reused", 0)
        except Exception as e:
            log.exception("hook extraction failed for %s: %s", aid, e)
            failed += 1
    library_size = session.query(Hook).count()
    return {
        "assets_scanned": len(asset_ids),
        "hooks_created": total_created,
        "hooks_reused": total_reused,
        "failed_assets": failed,
        "library_size": library_size,
    }


def relevant_hooks_for_formula(
    session: Session,
    *,
    target_sku: str,
    persona: str | None = None,
    hook_archetype: str | None = None,
    audio_language: str | None = None,
    top_k: int = 5,
) -> list[dict]:
    """US-10.3: surface top-K hooks matching the brief's intent."""
    q = session.query(Hook)
    # We score by relevance × performance; rather than a complex SQL ranking, pull a
    # superset of candidates and rank in Python.
    if hook_archetype:
        q = q.filter((Hook.hook_archetype == hook_archetype) | (Hook.sku == target_sku))
    else:
        q = q.filter(Hook.sku == target_sku)
    candidates = q.limit(200).all()

    def _score(h: Hook) -> float:
        relevance = 0.0
        if h.sku == target_sku: relevance += 0.30
        if persona and h.persona_implied == persona: relevance += 0.30
        if hook_archetype and h.hook_archetype == hook_archetype: relevance += 0.20
        if audio_language and h.language == audio_language: relevance += 0.20
        perf = ((h.parent_roas or 0) / 10) * 0.5 + ((h.parent_hook_rate or 0)) * 0.5
        return relevance + perf

    candidates.sort(key=_score, reverse=True)
    out = []
    seen_parents = set()
    for h in candidates:
        # Dedup by parent so we don't return 5 hooks from the same creative
        if h.source_asset_id in seen_parents and h.source_asset_id is not None:
            continue
        seen_parents.add(h.source_asset_id)
        out.append({
            "id": h.id,
            "text": h.text,
            "hook_type": h.hook_type,
            "source_asset_id": h.source_asset_id,
            "sku": h.sku,
            "hook_archetype": h.hook_archetype,
            "persona_implied": h.persona_implied,
            "language": h.language,
            "parent_roas": h.parent_roas,
            "parent_hook_rate": h.parent_hook_rate,
            "parent_spend": h.parent_spend,
            "relevance_score": round(_score(h), 3),
        })
        if len(out) >= top_k:
            break
    return out
