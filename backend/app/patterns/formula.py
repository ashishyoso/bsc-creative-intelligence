"""Magic Formula Engine (Module 4 / US-4.1 to US-4.4).

Given brief intent (target SKU + outcome metric + optional constraints), produce:
- A recommended tag combination across every key dimension (US-4.2)
- 3 closest historical reference creatives (US-4.3)
- Risk factors: weak confidence, missing data, constraint conflicts (US-4.4)

v1 is cohort-based — no ML. For each dimension we pick the value that has the
highest spend-weighted metric among historical creatives matching the brief.
Confidence is graded by N per PRD US-3.6.
"""
from __future__ import annotations

import statistics
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Iterable

from sqlalchemy.orm import Session

from app.db.models import Asset, AutoTag, PerformanceRow


# Dimensions we recommend on. The order is the display order in the output.
RECOMMEND_DIMENSIONS = [
    "format",
    "hook_archetype",
    "hook_mechanic",
    "persona_implied",
    "awareness_stage",
    "audio_language",
    "audio_type",
    "talent_type",
    "setting",
    "brand_visible_first_3s",
    "follows_60pct_rule",
]

DIMENSION_LABEL = {
    "format": "Format",
    "hook_archetype": "Hook archetype",
    "hook_mechanic": "Hook mechanic",
    "persona_implied": "Persona",
    "awareness_stage": "Awareness stage",
    "audio_language": "Language",
    "audio_type": "Audio type",
    "talent_type": "Talent type",
    "setting": "Setting",
    "brand_visible_first_3s": "Brand visible <3s",
    "follows_60pct_rule": "Follows 60% rule",
}

METRICS = {"roas", "hook_rate", "hold_rate", "ctr"}


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
class DimensionRecommendation:
    dimension: str
    label: str
    value: str | None
    metric_value: float | None
    n: int
    confidence: str
    alternatives: list[dict] = field(default_factory=list)  # top 3 alts


@dataclass
class ReferenceAsset:
    asset_id: str
    ad_name: str | None
    sku: str | None
    hook_archetype: str | None
    match_score: float  # 0..1, fraction of dimensions that match
    spend: float | None
    roas: float | None
    hook_rate: float | None
    asset_type: str
    actual_width: int | None
    actual_height: int | None


@dataclass
class FormulaResult:
    target_sku: str
    metric: str
    persona: str | None
    overall_confidence: str
    recommendations: list[DimensionRecommendation]
    references: list[ReferenceAsset]
    risks: list[str]
    cohort_size: int


def _value_of(tag: AutoTag, dim: str):
    return getattr(tag, dim, None)


def _row_metric(perf: PerformanceRow, metric: str) -> float | None:
    val = getattr(perf, metric, None)
    return float(val) if val is not None else None


def _is_truthy_dim(dim: str) -> bool:
    return dim in ("brand_visible_first_3s", "follows_60pct_rule")


def _stringify(val) -> str:
    return str(val) if val is not None else ""


def generate_formula(
    db: Session,
    *,
    target_sku: str,
    metric: str = "roas",
    persona: str | None = None,
    audio_language: str | None = None,
    format_constraint: str | None = None,
    forbidden_archetypes: list[str] | None = None,
    min_n: int = 3,
) -> FormulaResult:
    if metric not in METRICS:
        raise ValueError(f"metric must be one of {sorted(METRICS)}")

    forbidden_archetypes = forbidden_archetypes or []

    # Pull the cohort: all rows matching the mandatory filters
    q = (
        db.query(AutoTag, Asset, PerformanceRow)
        .join(Asset, Asset.asset_id == AutoTag.asset_id)
        .join(PerformanceRow, PerformanceRow.asset_id == Asset.asset_id)
        .filter(AutoTag.sku == target_sku)
    )
    if persona:
        q = q.filter(AutoTag.persona_implied == persona)
    if audio_language:
        q = q.filter(AutoTag.audio_language == audio_language)
    if format_constraint:
        q = q.filter(AutoTag.format == format_constraint)

    rows = q.all()
    cohort_size = len({a.asset_id for _, a, _ in rows})

    risks: list[str] = []
    if cohort_size == 0:
        return FormulaResult(
            target_sku=target_sku, metric=metric, persona=persona,
            overall_confidence="Insufficient",
            recommendations=[],
            references=[],
            risks=[f"No historical creatives match SKU={target_sku}" + (f" + persona={persona}" if persona else "") + ". Cannot generate formula."],
            cohort_size=0,
        )
    if cohort_size < 10:
        risks.append(f"Small cohort (N={cohort_size}) — recommendations are directional, treat as hypothesis.")

    # For each dimension, build a value-keyed bucket of (metric, spend)
    dim_recs: list[DimensionRecommendation] = []
    for dim in RECOMMEND_DIMENSIONS:
        buckets: dict[str, list[tuple[float, float]]] = defaultdict(list)
        for tag, asset, perf in rows:
            val = _value_of(tag, dim)
            if val is None or val == "":
                continue
            if dim == "hook_archetype" and val in forbidden_archetypes:
                continue
            m = _row_metric(perf, metric)
            if m is None:
                continue
            buckets[_stringify(val)].append((m, perf.spend or 0.0))

        if not buckets:
            dim_recs.append(DimensionRecommendation(
                dimension=dim, label=DIMENSION_LABEL[dim],
                value=None, metric_value=None, n=0, confidence="Insufficient",
            ))
            continue

        scored = []
        for v, samples in buckets.items():
            n = len(samples)
            if n < min_n:
                continue
            total_spend = sum(s for _, s in samples)
            if total_spend > 0:
                m = sum(mv * s for mv, s in samples) / total_spend
            else:
                m = statistics.fmean([mv for mv, _ in samples])
            scored.append((v, m, n))

        if not scored:
            # Fall back to best-of-any (even N<min_n) but mark Insufficient
            scored = [(v, statistics.fmean([mv for mv, _ in samples]), len(samples))
                      for v, samples in buckets.items()]

        scored.sort(key=lambda x: x[1], reverse=True)
        best_val, best_metric, best_n = scored[0]
        alts = [{"value": v, "metric_value": round(m, 4), "n": n} for v, m, n in scored[1:4]]

        dim_recs.append(DimensionRecommendation(
            dimension=dim, label=DIMENSION_LABEL[dim],
            value=best_val, metric_value=round(best_metric, 4),
            n=best_n, confidence=_confidence_for(best_n),
            alternatives=alts,
        ))

    # Compute overall confidence — the weakest non-Insufficient dim drives it.
    confidence_order = ["Insufficient", "Weak", "Moderate", "Strong", "Robust"]
    valid = [r for r in dim_recs if r.value is not None]
    if not valid:
        overall = "Insufficient"
    else:
        worst_idx = min(confidence_order.index(r.confidence) for r in valid)
        overall = confidence_order[worst_idx]

    # Identify risks
    weak_dims = [r.label for r in dim_recs if r.value is not None and r.confidence in ("Insufficient", "Weak")]
    if weak_dims:
        risks.append(f"Weak confidence on: {', '.join(weak_dims)}. Treat these as hypotheses.")
    missing_dims = [r.label for r in dim_recs if r.value is None]
    if missing_dims:
        risks.append(f"No data for: {', '.join(missing_dims)}. Will need creative judgement.")
    if persona:
        # Persona constraint can sometimes have N<5 even in a 1000-asset library
        persona_assets = {a.asset_id for t, a, _ in rows if t.persona_implied == persona}
        if len(persona_assets) < 5:
            risks.append(f"Only {len(persona_assets)} historical creatives target persona '{persona}' for {target_sku}.")

    # Pick 3 reference creatives — score each asset by how many dims match the recommendation
    rec_map = {r.dimension: r.value for r in dim_recs if r.value is not None}
    asset_score: dict[str, tuple[Asset, AutoTag, float, list[PerformanceRow]]] = {}
    for tag, asset, perf in rows:
        if asset.asset_id in asset_score:
            asset_score[asset.asset_id][3].append(perf)
            continue
        matches = sum(1 for d, v in rec_map.items() if _stringify(_value_of(tag, d)) == v)
        score = matches / max(len(rec_map), 1)
        asset_score[asset.asset_id] = (asset, tag, score, [perf])

    # Sort: 60% weight on match score, 40% on metric (per PRD §5.4 US-4.3)
    def _ref_sort_key(item):
        asset, tag, score, perfs = item
        spends = [p.spend or 0 for p in perfs]
        total_spend = sum(spends)
        m_vals = []
        for p in perfs:
            mv = _row_metric(p, metric)
            if mv is not None and p.spend:
                m_vals.append(mv * p.spend)
        weighted_m = sum(m_vals) / total_spend if total_spend > 0 and m_vals else 0
        # Normalize metric to ~0..1 — ROAS divided by 10, rates already 0..1
        norm = weighted_m / 10 if metric == "roas" else weighted_m
        return score * 0.6 + norm * 0.4

    top_refs = sorted(asset_score.values(), key=_ref_sort_key, reverse=True)[:3]

    references: list[ReferenceAsset] = []
    for asset, tag, score, perfs in top_refs:
        total_spend = sum(p.spend or 0 for p in perfs)
        w = 0.0
        roas_w = 0.0
        hook_w = 0.0
        for p in perfs:
            s = p.spend or 0
            if not s:
                continue
            if p.roas is not None:
                roas_w += p.roas * s
            if p.hook_rate is not None:
                hook_w += p.hook_rate * s
            w += s
        references.append(ReferenceAsset(
            asset_id=asset.asset_id,
            ad_name=asset.ad_refs[0].ad_name if asset.ad_refs else None,
            sku=tag.sku,
            hook_archetype=tag.hook_archetype,
            match_score=round(score, 3),
            spend=round(total_spend, 2),
            roas=round(roas_w / w, 3) if w > 0 else None,
            hook_rate=round(hook_w / w, 4) if w > 0 else None,
            asset_type=asset.asset_type,
            actual_width=asset.actual_width,
            actual_height=asset.actual_height,
        ))

    if len(references) < 3:
        risks.append(
            f"Only {len(references)} reference creative(s) closely match this formula. "
            f"The recommendation is leaning on partial-match patterns."
        )

    return FormulaResult(
        target_sku=target_sku,
        metric=metric,
        persona=persona,
        overall_confidence=overall,
        recommendations=dim_recs,
        references=references,
        risks=risks,
        cohort_size=cohort_size,
    )
