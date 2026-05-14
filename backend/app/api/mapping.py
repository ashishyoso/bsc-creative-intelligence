"""US-1.9: Mapping verification queue."""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.schemas import MappingQueueItem, MappingResolution
from app.db.models import AdReference, Asset, AuditEvent, MappingStatus, PerformanceRow
from app.db.session import get_db

router = APIRouter(prefix="/mapping", tags=["mapping"])


@router.get("/queue", response_model=list[MappingQueueItem])
def get_queue(db: Session = Depends(get_db)):
    assets = (
        db.query(Asset).filter(Asset.mapping_status == MappingStatus.MAPPING_SUSPECT.value).all()
    )
    out: list[MappingQueueItem] = []
    for asset in assets:
        ad_ref = asset.ad_refs[0] if asset.ad_refs else None
        perf = asset.performance_rows[0] if asset.performance_rows else None
        out.append(
            MappingQueueItem(
                asset_id=asset.asset_id,
                asset_type=asset.asset_type,
                mapping_status=asset.mapping_status,
                mapping_resolution_note=asset.mapping_resolution_note,
                declared_duration_seconds=asset.declared_duration_seconds,
                actual_duration_seconds=asset.actual_duration_seconds,
                actual_width=asset.actual_width,
                actual_height=asset.actual_height,
                storage_path=asset.storage_path,
                mapping_key=asset.mapping_key,
                primary_ad_id=ad_ref.ad_id if ad_ref else None,
                primary_ad_name=ad_ref.ad_name if ad_ref else None,
                spend=perf.spend if perf else None,
                impressions=perf.impressions if perf else None,
            )
        )
    return out


@router.post("/queue/{asset_id}/resolve")
def resolve(asset_id: str, body: MappingResolution = Body(...), db: Session = Depends(get_db)):
    asset = db.get(Asset, asset_id)
    if asset is None:
        raise HTTPException(404, "asset_not_found")
    if asset.mapping_status != MappingStatus.MAPPING_SUSPECT.value:
        raise HTTPException(400, f"not_in_queue: status={asset.mapping_status}")

    decision = body.decision.upper()
    if decision == "CONFIRM":
        asset.mapping_status = MappingStatus.MANUALLY_CONFIRMED.value
    elif decision == "REJECT":
        asset.mapping_status = MappingStatus.MAPPING_FAILED.value
    elif decision == "DIFFERENT_EDIT":
        # PRD: link both to the same concept but keep them separate. For pilot, we just
        # confirm and flag for the Hook Architect to manually set concept_id later.
        asset.mapping_status = MappingStatus.MANUALLY_CONFIRMED.value
        body.note = (body.note or "") + " [marked DIFFERENT_EDIT]"
    else:
        raise HTTPException(400, "invalid_decision")

    asset.mapping_resolution_note = body.note or asset.mapping_resolution_note
    asset.mapping_resolved_by = "pilot"
    asset.mapping_resolved_at = datetime.utcnow()

    db.add(
        AuditEvent(
            action_type="mapping_resolved",
            target_entity="asset",
            target_id=asset_id,
            payload=f"decision={decision} note={body.note}",
        )
    )
    db.commit()
    return {"ok": True, "asset_id": asset_id, "new_status": asset.mapping_status}
