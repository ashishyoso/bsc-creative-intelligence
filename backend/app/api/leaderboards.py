"""US-3.1, US-3.2, US-3.3, US-3.6, US-3.7: leaderboards with confidence indicators."""
from __future__ import annotations

import statistics
from collections import defaultdict

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.schemas import LeaderboardResponse, LeaderboardRow
from app.db.models import Asset, AutoTag, PerformanceRow
from app.db.session import get_db

router = APIRouter(prefix="/leaderboards", tags=["leaderboards"])

DIMENSIONS = {
    "sku": AutoTag.sku,
    "format": AutoTag.format,
    "hook_archetype": AutoTag.hook_archetype,
    "audio_type": AutoTag.audio_type,
    "audio_language": AutoTag.audio_language,
    "persona_implied": AutoTag.persona_implied,
    "awareness_stage": AutoTag.awareness_stage,
    "talent_type": AutoTag.talent_type,
    "setting": AutoTag.setting,
    "brand_visible_first_3s": AutoTag.brand_visible_first_3s,
}

METRICS = {"hook_rate", "hold_rate", "ctr", "roas", "spend"}


def _confidence_for(n: int) -> str:
    if n < 3:
        return "Insufficient"
    if n < 6:
        return "Weak"
    if n < 15:
        return "Moderate"
    if n < 30:
        return "Strong"
    return "Robust"


@router.get("", response_model=LeaderboardResponse)
def leaderboard(
    db: Session = Depends(get_db),
    dimension: str = Query("hook_archetype"),
    metric: str = Query("roas"),
    sku: str | None = None,
    spend_weighted: bool = True,
    min_n: int = 3,
):
    if dimension not in DIMENSIONS:
        return LeaderboardResponse(
            dimension=dimension,
            metric=metric,
            sku=sku,
            rows=[],
            notes=[f"unknown dimension. valid: {sorted(DIMENSIONS.keys())}"],
        )
    if metric not in METRICS:
        return LeaderboardResponse(
            dimension=dimension,
            metric=metric,
            sku=sku,
            rows=[],
            notes=[f"unknown metric. valid: {sorted(METRICS)}"],
        )

    q = (
        db.query(AutoTag, Asset, PerformanceRow)
        .join(Asset, Asset.asset_id == AutoTag.asset_id)
        .join(PerformanceRow, PerformanceRow.asset_id == Asset.asset_id)
    )
    if sku:
        q = q.filter(AutoTag.sku == sku)

    buckets: dict[str, list[tuple[float, float]]] = defaultdict(list)  # value -> [(metric, spend)]
    for tag, asset, perf in q.all():
        val = getattr(tag, dimension)
        if val is None or val == "":
            continue
        key = str(val)
        m_val = getattr(perf, metric, None)
        if m_val is None and metric != "spend":
            continue
        spend = perf.spend or 0.0
        if metric == "spend":
            buckets[key].append((spend, spend))
        else:
            buckets[key].append((float(m_val), spend))

    rows: list[LeaderboardRow] = []
    for value, samples in buckets.items():
        n = len(samples)
        if n < min_n:
            continue
        values = [v for v, _ in samples]
        spends = [s for _, s in samples]
        total_spend = sum(spends)
        if spend_weighted and metric != "spend" and total_spend > 0:
            metric_value = sum(v * s for v, s in samples) / total_spend
        elif metric == "spend":
            metric_value = total_spend
        else:
            metric_value = statistics.fmean(values)
        rows.append(
            LeaderboardRow(
                value=value,
                metric_value=round(metric_value, 6),
                median=round(statistics.median(values), 6) if values else None,
                n=n,
                confidence=_confidence_for(n),
                total_spend=round(total_spend, 2),
            )
        )

    rows.sort(key=lambda r: r.metric_value, reverse=True)
    notes: list[str] = []
    if len(rows) < 3:
        notes.append("Not enough variance yet — need more variety in this dimension")
    return LeaderboardResponse(
        dimension=dimension,
        metric=metric,
        sku=sku,
        rows=rows,
        notes=notes,
    )


@router.get("/skus")
def list_skus(db: Session = Depends(get_db)):
    rows = (
        db.query(AutoTag.sku, AutoTag)
        .filter(AutoTag.sku.isnot(None))
        .distinct()
        .all()
    )
    return sorted({r[0] for r in rows if r[0]})


@router.get("/anti-patterns")
def anti_patterns(
    db: Session = Depends(get_db),
    metric: str = Query("roas"),
    sku: str | None = None,
    min_n: int = Query(3, ge=1),
    top_k: int = Query(30, le=200),
    include_pairs: bool = True,
    fail_threshold_pct: float = Query(0.5, ge=0.1, le=1.0),
):
    """US-3.5: combinations that consistently underperform the benchmark."""
    from app.patterns.anti_patterns import benchmark_for, find_anti_patterns
    if metric not in METRICS:
        return {"error": f"metric must be one of {sorted(METRICS)}", "rows": []}
    rows = find_anti_patterns(
        db, metric=metric, sku=sku, min_n=min_n, top_k=top_k,
        include_pairs=include_pairs, fail_threshold_pct=fail_threshold_pct,
    )
    return {
        "metric": metric,
        "sku": sku,
        "benchmark": benchmark_for(metric, sku),
        "fail_threshold_pct": fail_threshold_pct,
        "count": len(rows),
        "rows": [r.__dict__ for r in rows],
    }


@router.get("/combinatorial")
def combinatorial(
    db: Session = Depends(get_db),
    metric: str = Query("roas"),
    sku: str | None = None,
    pin_dimension: str | None = None,
    min_n: int = Query(3, ge=1),
    top_k: int = Query(50, le=200),
    spend_weighted: bool = True,
):
    """US-3.4: pairs of tag values ranked by performance metric."""
    from app.patterns.combinatorial import PAIR_DIMENSIONS, mine_pairs

    if metric not in METRICS:
        return {"error": f"metric must be one of {sorted(METRICS)}", "rows": []}
    if pin_dimension and pin_dimension not in PAIR_DIMENSIONS:
        return {"error": f"pin_dimension must be one of {PAIR_DIMENSIONS}", "rows": []}

    combos = mine_pairs(
        db,
        metric=metric,
        sku=sku,
        pin_dimension=pin_dimension,
        min_n=min_n,
        top_k=top_k,
        spend_weighted=spend_weighted,
    )

    return {
        "metric": metric,
        "sku": sku,
        "pin_dimension": pin_dimension,
        "min_n": min_n,
        "spend_weighted": spend_weighted,
        "count": len(combos),
        "rows": [c.__dict__ for c in combos],
        "available_dimensions": PAIR_DIMENSIONS,
    }
