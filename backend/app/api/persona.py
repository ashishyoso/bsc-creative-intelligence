"""Persona coverage + matrix (US-3.9, US-3.10) and segment compare (US-3.8)."""
from __future__ import annotations

import statistics
from collections import defaultdict

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.models import Asset, AutoTag, PerformanceRow
from app.db.session import get_db

router = APIRouter(prefix="/persona", tags=["persona"])


@router.get("/coverage")
def coverage(
    db: Session = Depends(get_db),
    sku: str | None = None,
    days_lookback: int = 90,
):
    """US-3.9: how many creatives target each persona, spend-weighted vs count.

    Surfaces gaps: personas with 0 or very low coverage relative to others.
    """
    q = (
        db.query(AutoTag, Asset, PerformanceRow)
        .join(Asset, Asset.asset_id == AutoTag.asset_id)
        .join(PerformanceRow, PerformanceRow.asset_id == Asset.asset_id)
    )
    if sku:
        q = q.filter(AutoTag.sku == sku)
    rows = q.all()

    by_persona_count: dict[str, set[str]] = defaultdict(set)  # persona -> set(asset_id)
    by_persona_spend: dict[str, float] = defaultdict(float)
    total_assets: set[str] = set()
    total_spend = 0.0

    for tag, asset, perf in rows:
        total_assets.add(asset.asset_id)
        spend = perf.spend or 0
        total_spend += spend
        persona = tag.persona_implied or "Undifferentiated"
        by_persona_count[persona].add(asset.asset_id)
        by_persona_spend[persona] += spend

    out = []
    for persona in by_persona_count:
        count = len(by_persona_count[persona])
        spend = by_persona_spend[persona]
        out.append({
            "persona": persona,
            "creative_count": count,
            "spend": round(spend, 2),
            "pct_of_creatives": round(count / len(total_assets) * 100, 1) if total_assets else 0,
            "pct_of_spend": round(spend / total_spend * 100, 1) if total_spend else 0,
        })
    out.sort(key=lambda x: x["spend"], reverse=True)

    # Gap detection: any standard persona absent or below 5% of creatives
    STANDARD_PERSONAS = {
        "Corporate Professional", "Gym-Goer", "College Student",
        "Tier-2 Aspirational", "Dad/Husband", "Newly-Single/Glow-up",
        "Dating-Active", "Body-Conscious", "Hygiene-Aware",
    }
    present = set(by_persona_count.keys())
    gaps = []
    for p in STANDARD_PERSONAS:
        if p not in present:
            gaps.append({"persona": p, "reason": "no historical creatives"})
        else:
            cnt = len(by_persona_count[p])
            pct = cnt / len(total_assets) * 100 if total_assets else 0
            if pct < 5 and cnt < 5:
                gaps.append({"persona": p, "reason": f"only {cnt} creatives ({pct:.1f}% of library)"})

    return {
        "sku": sku,
        "total_creatives": len(total_assets),
        "total_spend": round(total_spend, 2),
        "rows": out,
        "gaps": gaps,
    }


@router.get("/matrix")
def matrix(db: Session = Depends(get_db), metric: str = Query("roas")):
    """US-3.10: persona × SKU performance grid (spend-weighted)."""
    if metric not in ("roas", "hook_rate", "hold_rate", "ctr"):
        return {"error": "invalid metric", "rows": []}

    rows = (
        db.query(AutoTag, PerformanceRow)
        .join(PerformanceRow, PerformanceRow.asset_id == AutoTag.asset_id)
        .all()
    )

    buckets: dict[tuple[str, str], list[tuple[float, float]]] = defaultdict(list)
    for tag, perf in rows:
        if not tag.sku or not tag.persona_implied:
            continue
        m = getattr(perf, metric, None)
        if m is None:
            continue
        buckets[(tag.persona_implied, tag.sku)].append((float(m), float(perf.spend or 0)))

    personas = sorted({p for p, _ in buckets.keys()})
    skus = sorted({s for _, s in buckets.keys()})

    cells = []
    for p in personas:
        for s in skus:
            samples = buckets.get((p, s), [])
            n = len(samples)
            if n == 0:
                cells.append({"persona": p, "sku": s, "metric_value": None, "n": 0, "total_spend": 0, "quadrant": None})
                continue
            total_spend = sum(spend for _, spend in samples)
            if total_spend > 0:
                m_val = sum(v * spend for v, spend in samples) / total_spend
            else:
                m_val = statistics.fmean([v for v, _ in samples])
            cells.append({
                "persona": p, "sku": s,
                "metric_value": round(m_val, 4),
                "n": n,
                "total_spend": round(total_spend, 2),
            })

    return {
        "metric": metric,
        "personas": personas,
        "skus": skus,
        "cells": cells,
    }


@router.get("/compare-segments")
def compare_segments(
    db: Session = Depends(get_db),
    a_sku: str | None = None, a_persona: str | None = None, a_language: str | None = None,
    b_sku: str | None = None, b_persona: str | None = None, b_language: str | None = None,
):
    """US-3.8: side-by-side comparison of two segments across all key metrics."""
    def _agg(sku, persona, language):
        q = (
            db.query(AutoTag, PerformanceRow)
            .join(PerformanceRow, PerformanceRow.asset_id == AutoTag.asset_id)
        )
        if sku: q = q.filter(AutoTag.sku == sku)
        if persona: q = q.filter(AutoTag.persona_implied == persona)
        if language: q = q.filter(AutoTag.audio_language == language)
        rows = q.all()
        spend = 0.0
        n = 0
        ms = {"roas": [], "hook_rate": [], "hold_rate": [], "ctr": []}
        for tag, perf in rows:
            spend += (perf.spend or 0)
            n += 1
            for k in ms.keys():
                v = getattr(perf, k, None)
                if v is not None and perf.spend:
                    ms[k].append((float(v), float(perf.spend)))
        result = {"n_rows": n, "spend": round(spend, 2)}
        for k, vals in ms.items():
            if not vals:
                result[k] = None
                continue
            total = sum(s for _, s in vals)
            result[k] = round(sum(v * s for v, s in vals) / total, 4) if total else None
        return result

    a = _agg(a_sku, a_persona, a_language)
    b = _agg(b_sku, b_persona, b_language)
    return {
        "segment_a": {"filters": {"sku": a_sku, "persona": a_persona, "language": a_language}, **a},
        "segment_b": {"filters": {"sku": b_sku, "persona": b_persona, "language": b_language}, **b},
    }
