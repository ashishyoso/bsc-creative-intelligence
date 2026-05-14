"""US-3.4: Combinatorial pattern mining.

Ranks PAIRS (and optionally triples) of tag values by selected performance metric.
Only combinations with N>=min_n are surfaced (per PRD).

Algorithm:
- Pull all (AutoTag, PerformanceRow) joined rows (filterable by SKU).
- For each pair of dimensions (d_a, d_b), iterate over each row and accumulate
  (metric_value, spend) into a bucket keyed by (val_a, val_b).
- For each bucket with N>=min_n: compute spend-weighted mean, median, total spend.
- Rank all buckets across all dimension pairs by metric_value desc.

Optimization: we don't enumerate every pair-of-pairs combinatorially over data;
we do one pass per pair-of-dimensions, which is O(dims² × rows).
For 1000 rows × 11 dims that's ~55,000 ops per metric — sub-second.
"""
from __future__ import annotations

import statistics
from collections import defaultdict
from dataclasses import dataclass
from itertools import combinations
from typing import Iterable

from sqlalchemy.orm import Session

from app.db.models import Asset, AutoTag, PerformanceRow


# Dimensions to consider for combinatorial mining.
# Keep tight — every added dim multiplies the pair count.
PAIR_DIMENSIONS = [
    "sku",
    "format",
    "hook_archetype",
    "persona_implied",
    "awareness_stage",
    "talent_type",
    "setting",
    "audio_language",
    "audio_type",
    "brand_visible_first_3s",
    "follows_60pct_rule",
]


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


@dataclass
class Combination:
    dim_a: str
    val_a: str
    dim_b: str
    val_b: str
    metric_value: float
    median: float | None
    n: int
    confidence: str
    total_spend: float
    sample_asset_ids: list[str]  # up to 3 example assets for drill-down


def _row_metric(perf: PerformanceRow, metric: str) -> float | None:
    if metric == "spend":
        return float(perf.spend or 0.0)
    val = getattr(perf, metric, None)
    if val is None:
        return None
    return float(val)


def _row_value(tag: AutoTag, dim: str) -> str | None:
    val = getattr(tag, dim, None)
    if val is None:
        return None
    return str(val)


def mine_pairs(
    db: Session,
    *,
    metric: str = "roas",
    sku: str | None = None,
    pin_dimension: str | None = None,
    min_n: int = 3,
    top_k: int = 50,
    spend_weighted: bool = True,
) -> list[Combination]:
    """Mine the top-K pairs of tag values for a given metric.

    Args:
        metric: one of roas | hook_rate | hold_rate | ctr | spend
        sku: restrict to this SKU
        pin_dimension: if set, only pairs that include this dimension
        min_n: minimum sample size per combination
        top_k: cap on number of returned combinations
        spend_weighted: if True, weight metric values by spend (default)
    """
    q = (
        db.query(AutoTag, Asset, PerformanceRow)
        .join(Asset, Asset.asset_id == AutoTag.asset_id)
        .join(PerformanceRow, PerformanceRow.asset_id == Asset.asset_id)
    )
    if sku:
        q = q.filter(AutoTag.sku == sku)

    rows = q.all()
    if not rows:
        return []

    # buckets[(d_a, v_a, d_b, v_b)] -> list of (metric_val, spend, asset_id)
    buckets: dict[tuple, list[tuple[float, float, str]]] = defaultdict(list)

    # Pre-extract per-row values + metric to avoid repeated getattr in the inner loop
    extracted: list[tuple[dict, float, float, str]] = []
    for tag, asset, perf in rows:
        m = _row_metric(perf, metric)
        if m is None:
            continue
        values = {d: _row_value(tag, d) for d in PAIR_DIMENSIONS}
        spend = float(perf.spend or 0.0)
        extracted.append((values, m, spend, asset.asset_id))

    dim_pairs: Iterable[tuple[str, str]]
    if pin_dimension and pin_dimension in PAIR_DIMENSIONS:
        dim_pairs = [(pin_dimension, d) for d in PAIR_DIMENSIONS if d != pin_dimension]
    else:
        dim_pairs = list(combinations(PAIR_DIMENSIONS, 2))

    for d_a, d_b in dim_pairs:
        for values, m, spend, asset_id in extracted:
            v_a = values[d_a]
            v_b = values[d_b]
            if v_a is None or v_b is None:
                continue
            buckets[(d_a, v_a, d_b, v_b)].append((m, spend, asset_id))

    combos: list[Combination] = []
    for (d_a, v_a, d_b, v_b), samples in buckets.items():
        n = len(samples)
        if n < min_n:
            continue
        values = [s[0] for s in samples]
        spends = [s[1] for s in samples]
        total_spend = sum(spends)

        if metric == "spend":
            metric_value = total_spend
        elif spend_weighted and total_spend > 0:
            metric_value = sum(v * s for v, s, _ in samples) / total_spend
        else:
            metric_value = statistics.fmean(values)

        median = statistics.median(values) if values else None

        # Sample assets sorted by metric value desc, take top 3
        sample_ids = [aid for _, _, aid in sorted(samples, key=lambda t: -t[0])[:3]]

        combos.append(
            Combination(
                dim_a=d_a,
                val_a=v_a,
                dim_b=d_b,
                val_b=v_b,
                metric_value=round(metric_value, 6),
                median=round(median, 6) if median is not None else None,
                n=n,
                confidence=_confidence_for(n),
                total_spend=round(total_spend, 2),
                sample_asset_ids=sample_ids,
            )
        )

    combos.sort(key=lambda c: c.metric_value, reverse=True)
    return combos[:top_k]
