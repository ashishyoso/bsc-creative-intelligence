"""Concepts API (US-1.6).

Endpoints:
- POST /concepts/recompute     → re-cluster all assets
- GET  /concepts                → list concepts with aggregate stats
- GET  /concepts/{concept_id}  → concept detail + per-variation assets
- POST /concepts/{concept_id}/rename → set human-friendly name (protects from auto-overwrite)
"""
from __future__ import annotations

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.models import Asset, AutoTag, Concept, PerformanceRow
from app.db.session import get_db
from app.patterns.concepts import recompute_concepts

router = APIRouter(prefix="/concepts", tags=["concepts"])


@router.post("/recompute")
def recompute(
    db: Session = Depends(get_db),
    hamming_threshold: int = 10,
    require_same_archetype: bool = True,
):
    return recompute_concepts(
        db,
        hamming_threshold=hamming_threshold,
        require_same_archetype=require_same_archetype,
    )


@router.get("")
def list_concepts(db: Session = Depends(get_db), min_assets: int = 1):
    concepts = db.query(Concept).all()
    out: list[dict] = []
    for c in concepts:
        assets = db.query(Asset).filter(Asset.concept_id == c.concept_id).all()
        if len(assets) < min_assets:
            continue
        perfs = (
            db.query(PerformanceRow)
            .join(Asset, Asset.asset_id == PerformanceRow.asset_id)
            .filter(Asset.concept_id == c.concept_id)
            .all()
        )
        spend = sum((p.spend or 0) for p in perfs)
        weight = 0.0
        roas_accum = 0.0
        hook_accum = 0.0
        for p in perfs:
            s = p.spend or 0
            if not s:
                continue
            if p.roas is not None:
                roas_accum += p.roas * s
            if p.hook_rate is not None:
                hook_accum += p.hook_rate * s
            weight += s
        out.append({
            "concept_id": c.concept_id,
            "concept_name": c.concept_name,
            "asset_count": len(assets),
            "total_spend": round(spend, 2),
            "avg_roas": round(roas_accum / weight, 3) if weight > 0 else None,
            "avg_hook_rate": round(hook_accum / weight, 4) if weight > 0 else None,
            "first_seen_at": c.first_seen_at.isoformat() if c.first_seen_at else None,
            "last_seen_at": c.last_seen_at.isoformat() if c.last_seen_at else None,
            "sample_asset_id": assets[0].asset_id if assets else None,
        })
    out.sort(key=lambda x: x["total_spend"] or 0, reverse=True)
    return out


@router.get("/{concept_id}")
def concept_detail(concept_id: str, db: Session = Depends(get_db)):
    concept = db.get(Concept, concept_id)
    if not concept:
        raise HTTPException(404, "concept_not_found")
    assets = db.query(Asset).filter(Asset.concept_id == concept_id).all()
    variations = []
    for a in assets:
        perfs = a.performance_rows
        spend = sum((p.spend or 0) for p in perfs)
        impressions = sum((p.impressions or 0) for p in perfs)
        # spend-weighted ROAS
        w = 0.0
        roas = 0.0
        hook = 0.0
        for p in perfs:
            s = p.spend or 0
            if not s:
                continue
            if p.roas is not None:
                roas += p.roas * s
            if p.hook_rate is not None:
                hook += p.hook_rate * s
            w += s
        variations.append({
            "asset_id": a.asset_id,
            "asset_type": a.asset_type,
            "actual_width": a.actual_width,
            "actual_height": a.actual_height,
            "ad_name": a.ad_refs[0].ad_name if a.ad_refs else None,
            "spend": spend,
            "impressions": impressions,
            "roas": round(roas / w, 3) if w > 0 else None,
            "hook_rate": round(hook / w, 4) if w > 0 else None,
            "sku": a.autotag.sku if a.autotag else None,
            "hook_archetype": a.autotag.hook_archetype if a.autotag else None,
        })
    variations.sort(key=lambda v: v["spend"] or 0, reverse=True)
    return {
        "concept_id": concept.concept_id,
        "concept_name": concept.concept_name,
        "asset_count": len(variations),
        "variations": variations,
    }


class RenameRequest(BaseModel):
    name: str


@router.post("/{concept_id}/rename")
def rename_concept(concept_id: str, body: RenameRequest, db: Session = Depends(get_db)):
    concept = db.get(Concept, concept_id)
    if not concept:
        raise HTTPException(404, "concept_not_found")
    # Stripping the "auto:" prefix marks this concept as manually owned —
    # future recompute passes will leave it alone.
    concept.concept_name = body.name
    db.commit()
    return {"ok": True, "concept_id": concept_id, "name": body.name}
