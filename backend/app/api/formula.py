"""Magic Formula API (Module 4).

Single endpoint: POST /formula/generate — accepts a brief intent, returns
a recommended tag combination + reference creatives + risks.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.patterns.anti_patterns import anti_patterns_for_formula
from app.patterns.formula import generate_formula

router = APIRouter(prefix="/formula", tags=["formula"])


class BriefIntent(BaseModel):
    target_sku: str = Field(..., description="Required. e.g. 'FBT SE'")
    metric: str = Field("roas", description="Outcome metric: roas | hook_rate | hold_rate | ctr")
    persona: str | None = None
    audio_language: str | None = None
    format_constraint: str | None = None
    forbidden_archetypes: list[str] = Field(default_factory=list)
    min_n: int = 3


@router.post("/generate")
def generate(req: BriefIntent, db: Session = Depends(get_db)):
    try:
        result = generate_formula(
            db,
            target_sku=req.target_sku,
            metric=req.metric,
            persona=req.persona,
            audio_language=req.audio_language,
            format_constraint=req.format_constraint,
            forbidden_archetypes=req.forbidden_archetypes,
            min_n=req.min_n,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))

    # US-4.4: surface relevant anti-patterns alongside the recommendation
    anti_patterns = anti_patterns_for_formula(
        db,
        target_sku=req.target_sku,
        persona=req.persona,
        metric=req.metric,
        top_k=5,
    )

    return {
        "target_sku": result.target_sku,
        "metric": result.metric,
        "persona": result.persona,
        "cohort_size": result.cohort_size,
        "overall_confidence": result.overall_confidence,
        "anti_patterns": anti_patterns,
        "recommendations": [
            {
                "dimension": r.dimension,
                "label": r.label,
                "value": r.value,
                "metric_value": r.metric_value,
                "n": r.n,
                "confidence": r.confidence,
                "alternatives": r.alternatives,
            }
            for r in result.recommendations
        ],
        "references": [
            {
                "asset_id": r.asset_id,
                "ad_name": r.ad_name,
                "sku": r.sku,
                "hook_archetype": r.hook_archetype,
                "match_score": r.match_score,
                "spend": r.spend,
                "roas": r.roas,
                "hook_rate": r.hook_rate,
                "asset_type": r.asset_type,
                "actual_width": r.actual_width,
                "actual_height": r.actual_height,
            }
            for r in result.references
        ],
        "risks": result.risks,
    }
