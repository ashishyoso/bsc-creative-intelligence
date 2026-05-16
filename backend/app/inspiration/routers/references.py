"""
Saved Reference Library (Epic 5) — read-side for the route boards, detail
view, shot breakdown post-save form, and stable permalinks.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.inspiration.auth import current_user
from app.inspiration.db import get_db
from app.inspiration.models import Decision, Route, ShotBreakdown, User, Video
from app.inspiration.schemas import ReferenceOut, ShotBreakdownIn, ShotBreakdownOut, VideoSummary

router = APIRouter(prefix="/inspiration/references", tags=["inspiration:library"])


def _serialize_reference(d: Decision, v: Video, route_name: str | None, saved_by_name: str | None, sb: ShotBreakdown | None) -> ReferenceOut:
    return ReferenceOut(
        decision_id=d.id,
        video=VideoSummary.model_validate(v),
        product_id=d.product_id,  # type: ignore[arg-type]
        route_id=d.route_id,  # type: ignore[arg-type]
        route_name=route_name,
        replicability=d.replicability,  # type: ignore[arg-type]
        why_text=d.why_text or "",
        saved_by=d.editor_user_id,
        saved_by_name=saved_by_name,
        saved_at=d.decided_at,
        shot_breakdown=ShotBreakdownOut.model_validate(sb) if sb else None,
    )


@router.get("", response_model=list[ReferenceOut])
def list_references(
    product_id: str = Query(...),
    route_id: str = Query(...),
    replicability: list[str] | None = Query(None),
    search: str | None = None,
    sort: str = Query("recent", regex="^(recent|oldest|brand|replicability)$"),
    limit: int = Query(100, le=500),
    db: Session = Depends(get_db),
):
    """US-5.1 — route board view."""
    q = (
        db.query(Decision, Video, Route, User, ShotBreakdown)
        .join(Video, Video.id == Decision.video_id)
        .outerjoin(Route, Route.id == Decision.route_id)
        .outerjoin(User, User.id == Decision.editor_user_id)
        .outerjoin(ShotBreakdown, ShotBreakdown.decision_id == Decision.id)
        .filter(
            Decision.action == "saved",
            Decision.product_id == product_id,
            Decision.route_id == route_id,
        )
    )
    if replicability:
        q = q.filter(Decision.replicability.in_(replicability))
    if search:
        like = f"%{search}%"
        from sqlalchemy import or_
        q = q.filter(
            or_(
                Video.brand.ilike(like),
                Video.headline.ilike(like),
                Video.primary_text.ilike(like),
                Decision.why_text.ilike(like),
            )
        )
    if sort == "recent":
        q = q.order_by(Decision.decided_at.desc())
    elif sort == "oldest":
        q = q.order_by(Decision.decided_at.asc())
    elif sort == "brand":
        q = q.order_by(Video.brand.asc(), Decision.decided_at.desc())
    elif sort == "replicability":
        q = q.order_by(Decision.replicability.asc(), Decision.decided_at.desc())

    rows = q.limit(limit).all()
    return [
        _serialize_reference(d, v, r.name if r else None, u.name if u else None, sb)
        for d, v, r, u, sb in rows
    ]


@router.get("/{decision_id}", response_model=ReferenceOut)
def get_reference(decision_id: str, db: Session = Depends(get_db)):
    """US-5.2 — reference detail. Stable permalink target."""
    row = (
        db.query(Decision, Video, Route, User, ShotBreakdown)
        .join(Video, Video.id == Decision.video_id)
        .outerjoin(Route, Route.id == Decision.route_id)
        .outerjoin(User, User.id == Decision.editor_user_id)
        .outerjoin(ShotBreakdown, ShotBreakdown.decision_id == Decision.id)
        .filter(Decision.id == decision_id, Decision.action == "saved")
        .first()
    )
    if row is None:
        raise HTTPException(404, "reference_not_found")
    d, v, r, u, sb = row
    return _serialize_reference(d, v, r.name if r else None, u.name if u else None, sb)


@router.put("/{decision_id}/shot-breakdown", response_model=ShotBreakdownOut)
def upsert_shot_breakdown(
    decision_id: str,
    body: ShotBreakdownIn,
    user=Depends(current_user),
    db: Session = Depends(get_db),
):
    """US-5.3 — optional shot breakdown, all fields optional."""
    d = db.get(Decision, decision_id)
    if d is None or d.action != "saved":
        raise HTTPException(404, "reference_not_found")
    sb = db.get(ShotBreakdown, decision_id)
    if sb is None:
        sb = ShotBreakdown(decision_id=decision_id)
        db.add(sb)
    sb.shot_count = body.shot_count
    sb.camera_type = body.camera_type
    sb.lighting_type = body.lighting_type
    sb.audio_approach = body.audio_approach
    sb.opening_hook = body.opening_hook
    sb.end_frame = body.end_frame
    sb.total_runtime_seconds = body.total_runtime_seconds
    from datetime import datetime, timezone
    sb.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(sb)
    return sb
