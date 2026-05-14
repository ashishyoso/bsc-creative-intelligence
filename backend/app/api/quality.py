"""Quality dashboards (US-7.3, US-7.4).

- 60% rule compliance: % of (video) creatives where product reveal is >= 60% of duration
- Brand-in-first-3s audit: how many show brand <3s + their spend/perf
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.db.models import Asset, AutoTag, PerformanceRow
from app.db.session import get_db

router = APIRouter(prefix="/quality", tags=["quality"])


@router.get("/60pct-rule")
def sixty_pct_rule(db: Session = Depends(get_db), sku: str | None = None):
    """% of (video) creatives where product reveal lands at >=60% of duration."""
    q = (
        db.query(AutoTag, Asset)
        .join(Asset, Asset.asset_id == AutoTag.asset_id)
        .filter(Asset.asset_type == "video")
    )
    if sku:
        q = q.filter(AutoTag.sku == sku)

    rows = q.all()
    total = len(rows)
    if not total:
        return {"total": 0, "compliant": 0, "compliance_pct": 0.0, "violations": []}

    compliant = sum(1 for t, _ in rows if t.follows_60pct_rule is True)
    violations: list[dict] = []
    for t, a in rows:
        if t.follows_60pct_rule is False:
            perfs = a.performance_rows
            spend = sum((p.spend or 0) for p in perfs)
            # spend-weighted ROAS
            w = sum((p.spend or 0) for p in perfs if p.roas is not None)
            roas = sum((p.roas or 0) * (p.spend or 0) for p in perfs) / w if w > 0 else None
            violations.append({
                "asset_id": a.asset_id,
                "ad_name": a.ad_refs[0].ad_name if a.ad_refs else None,
                "sku": t.sku,
                "product_reveal_second": t.product_reveal_second,
                "product_reveal_pct": t.product_reveal_pct,
                "duration": a.actual_duration_seconds,
                "spend": spend,
                "roas": round(roas, 3) if roas else None,
            })
    violations.sort(key=lambda v: v["spend"] or 0, reverse=True)
    return {
        "total": total,
        "compliant": compliant,
        "compliance_pct": round(compliant / total * 100, 1),
        "violations": violations[:50],
    }


@router.get("/brand-first-3s")
def brand_first_3s(db: Session = Depends(get_db), sku: str | None = None):
    """Audit creatives showing brand in first 3s — total spend, mean ROAS."""
    q = (
        db.query(AutoTag, Asset)
        .join(Asset, Asset.asset_id == AutoTag.asset_id)
    )
    if sku:
        q = q.filter(AutoTag.sku == sku)

    rows = q.all()
    total = len(rows)
    yes_count = sum(1 for t, _ in rows if t.brand_visible_first_3s is True)

    yes_spend = 0.0
    yes_roas_w = 0.0
    yes_hook_w = 0.0
    yes_weight = 0.0
    no_spend = 0.0
    no_roas_w = 0.0
    no_hook_w = 0.0
    no_weight = 0.0
    yes_items: list[dict] = []

    for t, a in rows:
        perfs = a.performance_rows
        spend = sum((p.spend or 0) for p in perfs)
        if not perfs:
            continue
        w = sum((p.spend or 0) for p in perfs if p.roas is not None) or 1
        roas = sum((p.roas or 0) * (p.spend or 0) for p in perfs) / w
        hook = sum((p.hook_rate or 0) * (p.spend or 0) for p in perfs) / w if w else 0
        if t.brand_visible_first_3s is True:
            yes_spend += spend
            yes_roas_w += roas * spend
            yes_hook_w += hook * spend
            yes_weight += spend
            yes_items.append({
                "asset_id": a.asset_id,
                "ad_name": a.ad_refs[0].ad_name if a.ad_refs else None,
                "sku": t.sku,
                "spend": round(spend, 2),
                "roas": round(roas, 3),
                "hook_rate": round(hook, 4),
            })
        elif t.brand_visible_first_3s is False:
            no_spend += spend
            no_roas_w += roas * spend
            no_hook_w += hook * spend
            no_weight += spend

    yes_items.sort(key=lambda x: x["spend"] or 0, reverse=True)

    return {
        "total": total,
        "brand_first_3s_count": yes_count,
        "brand_first_3s_pct": round(yes_count / total * 100, 1) if total else 0,
        "yes_aggregate": {
            "spend": round(yes_spend, 2),
            "weighted_roas": round(yes_roas_w / yes_weight, 3) if yes_weight else None,
            "weighted_hook_rate": round(yes_hook_w / yes_weight, 4) if yes_weight else None,
        },
        "no_aggregate": {
            "spend": round(no_spend, 2),
            "weighted_roas": round(no_roas_w / no_weight, 3) if no_weight else None,
            "weighted_hook_rate": round(no_hook_w / no_weight, 4) if no_weight else None,
        },
        "top_offenders": yes_items[:50],
    }
