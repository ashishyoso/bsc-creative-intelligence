"""Auto-tag review queue (US-7.1).

Surfaces ~10% of recent auto-tagged assets weighted toward:
- low-confidence SKU detections,
- high-spend creatives,
- and novel tag combinations.

Hook Architect approves or rejects-with-corrections. Corrections feed back into
the autotag.status field (AUTO → HUMAN_VERIFIED or OVERRIDDEN).
"""
from __future__ import annotations

import random
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from app.db.models import Asset, AuditEvent, AutoTag, PerformanceRow, TagStatus
from app.db.session import get_db

router = APIRouter(prefix="/review", tags=["review"])


@router.get("/queue")
def get_queue(
    db: Session = Depends(get_db),
    sample_pct: float = 0.10,
    days_lookback: int = 7,
):
    """Sample ~10% of recently-tagged assets, weighted by attention-need signals.

    Weighting:
    - Low SKU confidence (sku_confidence < 0.8): always include if in lookback
    - Top 10% by spend: always include
    - Random sample of the remainder to bring total to ~sample_pct
    """
    cutoff = datetime.utcnow() - timedelta(days=days_lookback)
    base = (
        db.query(AutoTag, Asset)
        .join(Asset, Asset.asset_id == AutoTag.asset_id)
        .filter(AutoTag.status == TagStatus.AUTO.value)
        .filter(AutoTag.created_at >= cutoff)
        .all()
    )

    must_include: list[tuple[AutoTag, Asset, str]] = []
    rest: list[tuple[AutoTag, Asset]] = []

    # Pre-aggregate spend
    spends = {}
    for tag, asset in base:
        spends[asset.asset_id] = sum((p.spend or 0) for p in asset.performance_rows)

    spend_sorted = sorted(spends.values(), reverse=True)
    high_spend_threshold = spend_sorted[max(0, len(spend_sorted) // 10)] if spend_sorted else 0

    for tag, asset in base:
        reasons = []
        if tag.sku_confidence is not None and tag.sku_confidence < 0.80:
            reasons.append("low SKU confidence")
        if spends.get(asset.asset_id, 0) >= high_spend_threshold and high_spend_threshold > 0:
            reasons.append("top-decile spend")
        if reasons:
            must_include.append((tag, asset, ", ".join(reasons)))
        else:
            rest.append((tag, asset))

    # Add random sample to reach the target percentage
    target_total = max(int(len(base) * sample_pct), len(must_include))
    needed = max(0, target_total - len(must_include))
    random.seed(int(datetime.utcnow().timestamp()) // 86400)  # daily-stable shuffle
    random.shuffle(rest)
    sampled = rest[:needed]

    out = []
    for tag, asset, *reason in must_include:
        out.append(_serialize(tag, asset, spends.get(asset.asset_id, 0), reason[0] if reason else "high-priority"))
    for tag, asset in sampled:
        out.append(_serialize(tag, asset, spends.get(asset.asset_id, 0), "random sample"))
    # Sort: highest spend first
    out.sort(key=lambda x: x["spend"] or 0, reverse=True)
    return {
        "total_eligible": len(base),
        "queue_size": len(out),
        "sample_pct_realized": round(len(out) / len(base), 3) if base else 0,
        "items": out,
    }


def _serialize(tag: AutoTag, asset: Asset, spend: float, reason: str) -> dict:
    return {
        "asset_id": asset.asset_id,
        "asset_type": asset.asset_type,
        "actual_width": asset.actual_width,
        "actual_height": asset.actual_height,
        "spend": spend,
        "reason": reason,
        "ad_name": asset.ad_refs[0].ad_name if asset.ad_refs else None,
        "tag_status": tag.status,
        "fields": {
            "sku": {"value": tag.sku, "confidence": tag.sku_confidence},
            "format": {"value": tag.format},
            "hook_archetype": {"value": tag.hook_archetype},
            "persona_implied": {"value": tag.persona_implied},
            "awareness_stage": {"value": tag.awareness_stage},
            "audio_language": {"value": tag.audio_language},
            "talent_type": {"value": tag.talent_type},
            "setting": {"value": tag.setting},
            "brand_visible_first_3s": {"value": tag.brand_visible_first_3s},
            "follows_60pct_rule": {"value": tag.follows_60pct_rule},
        },
    }


class ReviewDecision(BaseModel):
    decision: str  # 'approve' | 'override'
    corrections: dict | None = None  # field name -> new value, only for 'override'
    notes: str | None = None


@router.post("/{asset_id}")
def submit_review(asset_id: str, body: ReviewDecision, db: Session = Depends(get_db)):
    asset = db.get(Asset, asset_id)
    if not asset or not asset.autotag:
        raise HTTPException(404, "asset_or_tag_not_found")

    decision = body.decision.lower()
    if decision == "approve":
        asset.autotag.status = TagStatus.HUMAN_VERIFIED.value
        asset.autotag.reviewed_at = datetime.utcnow()
        asset.autotag.reviewed_by = "pilot"
    elif decision == "override":
        asset.autotag.status = TagStatus.OVERRIDDEN.value
        asset.autotag.reviewed_at = datetime.utcnow()
        asset.autotag.reviewed_by = "pilot"
        if body.corrections:
            allowed = {
                "sku", "format", "hook_archetype", "persona_implied",
                "awareness_stage", "audio_language", "talent_type", "setting",
                "brand_visible_first_3s", "follows_60pct_rule",
            }
            for field, value in body.corrections.items():
                if field in allowed:
                    setattr(asset.autotag, field, value)
    else:
        raise HTTPException(400, "decision must be approve or override")

    db.add(AuditEvent(
        action_type=f"review_{decision}",
        target_entity="autotag",
        target_id=str(asset.autotag.id),
        payload=str(body.model_dump()),
    ))
    db.commit()
    return {"ok": True, "new_status": asset.autotag.status}
