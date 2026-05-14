"""US-3.5: Anti-pattern library.

The mirror of combinatorial mining. A combination becomes an anti-pattern when:
- N >= min_n (we have evidence), AND
- average metric is below the SKU benchmark threshold

Single-dim anti-patterns: same logic on univariate leaderboards.
Returns the worst-performing combinations, sorted ascending by metric_value.
"""
from __future__ import annotations

import statistics
from collections import defaultdict
from dataclasses import asdict, dataclass

from sqlalchemy.orm import Session

from app.db.models import Asset, AutoTag, PerformanceRow


# SKU-specific ROAS benchmarks per the PRD playbook.
# (mapping kept loose — falls back to a default for unknown SKUs)
SKU_ROAS_BENCHMARK = {
    "FBT": 3.0,
    "FBT SE": 3.0,
    "3@999": 5.0,
    "18hr Sale": 4.0,
    "Legend 365": 3.0,
    "Bombae": 2.5,
    "Fragrance": 2.5,
    "Razors": 3.0,
    "Blo Trimmer": 3.0,
}
DEFAULT_ROAS_BENCHMARK = 3.0

# Hook-rate benchmark: PRD's "kill" rule is hook<25%; "good" is >=30%.
HOOK_RATE_BENCHMARK = 0.25


def benchmark_for(metric: str, sku: str | None) -> float:
    if metric == "roas":
        return SKU_ROAS_BENCHMARK.get(sku or "", DEFAULT_ROAS_BENCHMARK)
    if metric == "hook_rate":
        return HOOK_RATE_BENCHMARK
    if metric == "hold_rate":
        return 0.15
    if metric == "ctr":
        return 0.01
    return 0.0


def _confidence_for(n: int) -> str:
    if n < 3: return "Insufficient"
    if n < 6: return "Weak"
    if n < 15: return "Moderate"
    if n < 30: return "Strong"
    return "Robust"


@dataclass
class AntiPattern:
    dim_a: str
    val_a: str
    dim_b: str | None
    val_b: str | None
    metric_value: float
    n: int
    confidence: str
    total_spend: float
    sample_asset_ids: list[str]
    benchmark: float  # what threshold this combo failed against
    deficit_pct: float  # how far below benchmark, as fraction


def find_anti_patterns(
    db: Session,
    *,
    metric: str = "roas",
    sku: str | None = None,
    min_n: int = 3,
    top_k: int = 30,
    include_pairs: bool = True,
    fail_threshold_pct: float = 0.5,
    spend_weighted: bool = True,
) -> list[AntiPattern]:
    """Return combinations that consistently underperform the benchmark.

    fail_threshold_pct: how far below benchmark the combo must average to qualify.
    Default 0.5 means "average is below 50% of benchmark". PRD §5.3 US-3.5.
    """
    from app.patterns.combinatorial import PAIR_DIMENSIONS

    benchmark = benchmark_for(metric, sku)
    fail_at = benchmark * fail_threshold_pct

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

    extracted = []
    for tag, asset, perf in rows:
        m = getattr(perf, metric, None)
        if m is None:
            continue
        if metric == "spend":
            m_val = float(perf.spend or 0)
        else:
            m_val = float(m)
        values = {d: getattr(tag, d, None) for d in PAIR_DIMENSIONS}
        extracted.append((values, m_val, float(perf.spend or 0), asset.asset_id))

    out: list[AntiPattern] = []

    # 1) Single-dim anti-patterns
    for dim in PAIR_DIMENSIONS:
        buckets: dict[str, list[tuple[float, float, str]]] = defaultdict(list)
        for values, m, spend, aid in extracted:
            v = values[dim]
            if v is None or v == "":
                continue
            buckets[str(v)].append((m, spend, aid))
        for val, samples in buckets.items():
            n = len(samples)
            if n < min_n: continue
            total_spend = sum(s for _, s, _ in samples)
            if spend_weighted and total_spend > 0:
                m_avg = sum(mv * s for mv, s, _ in samples) / total_spend
            else:
                m_avg = statistics.fmean([mv for mv, _, _ in samples])
            if m_avg >= fail_at: continue
            out.append(AntiPattern(
                dim_a=dim, val_a=val, dim_b=None, val_b=None,
                metric_value=round(m_avg, 6),
                n=n, confidence=_confidence_for(n),
                total_spend=round(total_spend, 2),
                sample_asset_ids=[aid for _, _, aid in sorted(samples, key=lambda t: t[0])[:3]],
                benchmark=benchmark,
                deficit_pct=round(1 - (m_avg / benchmark), 3) if benchmark > 0 else 0,
            ))

    # 2) Pair anti-patterns (optional, more compute)
    if include_pairs:
        from itertools import combinations as _comb
        for d_a, d_b in _comb(PAIR_DIMENSIONS, 2):
            buckets2: dict[tuple, list] = defaultdict(list)
            for values, m, spend, aid in extracted:
                v_a, v_b = values[d_a], values[d_b]
                if v_a is None or v_b is None: continue
                buckets2[(str(v_a), str(v_b))].append((m, spend, aid))
            for (v_a, v_b), samples in buckets2.items():
                n = len(samples)
                if n < min_n: continue
                total_spend = sum(s for _, s, _ in samples)
                if spend_weighted and total_spend > 0:
                    m_avg = sum(mv * s for mv, s, _ in samples) / total_spend
                else:
                    m_avg = statistics.fmean([mv for mv, _, _ in samples])
                if m_avg >= fail_at: continue
                out.append(AntiPattern(
                    dim_a=d_a, val_a=v_a, dim_b=d_b, val_b=v_b,
                    metric_value=round(m_avg, 6),
                    n=n, confidence=_confidence_for(n),
                    total_spend=round(total_spend, 2),
                    sample_asset_ids=[aid for _, _, aid in sorted(samples, key=lambda t: t[0])[:3]],
                    benchmark=benchmark,
                    deficit_pct=round(1 - (m_avg / benchmark), 3) if benchmark > 0 else 0,
                ))

    # Sort by metric_value ascending (worst first), tiebreak by spend desc (real money wasted)
    out.sort(key=lambda a: (a.metric_value, -a.total_spend))
    return out[:top_k]


def anti_patterns_for_formula(
    db: Session,
    *,
    target_sku: str,
    persona: str | None = None,
    metric: str = "roas",
    top_k: int = 5,
) -> list[dict]:
    """A small set of anti-patterns relevant to the formula's SKU/persona — for
    surfacing inside the Magic Formula risk panel (US-4.4)."""
    rows = find_anti_patterns(
        db, metric=metric, sku=target_sku, min_n=3, top_k=20, include_pairs=False,
    )
    # If the user pinned a persona, prefer anti-patterns that involve that persona OR
    # are persona-agnostic
    if persona:
        prioritized = [r for r in rows if r.dim_a == "persona_implied" and r.val_a == persona]
        agnostic = [r for r in rows if r.dim_a != "persona_implied"]
        rows = (prioritized + agnostic)[:top_k]
    else:
        rows = rows[:top_k]
    return [asdict(r) for r in rows]
