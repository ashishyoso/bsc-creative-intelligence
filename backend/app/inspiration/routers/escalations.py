"""
Senior Reviewer queue (US-8.1).

Re-uses /inspiration/videos?status=escalated for the list. This router
exposes the senior-only actions: send-back, save (full tagging), reject.
"""
from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.inspiration.auth import require_roles
from app.inspiration.db import get_db
from app.inspiration.models import Decision, Video
from app.inspiration.schemas import DecisionOut, RejectDecisionIn, SaveDecisionIn
from app.inspiration.util import ulid

router = APIRouter(prefix="/inspiration/escalations", tags=["inspiration:senior_review"])


class SendBackIn(BaseModel):
    video_id: str
    note: str | None = None


def _original_editor(db: Session, video_id: str) -> str | None:
    last = (
        db.query(Decision)
        .filter(Decision.video_id == video_id, Decision.action == "escalated")
        .order_by(Decision.decided_at.desc())
        .first()
    )
    return last.editor_user_id if last else None


@router.post("/send-back", status_code=204)
def send_back(
    body: SendBackIn,
    user=Depends(require_roles("senior_reviewer", "founder", "admin")),
    db: Session = Depends(get_db),
):
    """US-8.1 send-back. Sets video back to pending; original escalator
    cannot re-escalate the same video. (Enforcement: we record the note on
    the escalation Decision row and rely on the frontend to hide the
    Escalate action when current_user.id == original_editor.)"""
    v = db.get(Video, body.video_id)
    if v is None:
        raise HTTPException(404, "video_not_found")
    if v.status != "escalated":
        raise HTTPException(409, "video_not_escalated")
    v.status = "pending"
    # Annotate the most recent escalation with the send-back note
    last = (
        db.query(Decision)
        .filter(Decision.video_id == v.id, Decision.action == "escalated")
        .order_by(Decision.decided_at.desc())
        .first()
    )
    if last is not None and body.note:
        last.escalation_note = (last.escalation_note or "") + f"\n[sent back: {body.note}]"
    db.commit()


@router.post("/resolve-save", response_model=DecisionOut, status_code=201)
def resolve_with_save(
    body: SaveDecisionIn,
    background: BackgroundTasks,
    user=Depends(require_roles("senior_reviewer", "founder", "admin")),
    db: Session = Depends(get_db),
):
    """Senior reviewer accepts the video as a saved reference."""
    v = db.get(Video, body.video_id)
    if v is None:
        raise HTTPException(404, "video_not_found")
    if v.status not in ("escalated", "pending"):
        raise HTTPException(409, "not_actionable")
    d = Decision(
        id=ulid(),
        video_id=v.id,
        editor_user_id=user.id,
        action="saved",
        product_id=body.product_id,
        route_id=body.route_id,
        replicability=body.replicability,
        why_text=body.why_text,
    )
    db.add(d)
    v.status = "saved"
    db.commit()
    db.refresh(d)
    from app.inspiration.sync.notion import enqueue_sync
    background.add_task(enqueue_sync, d.id)
    return d


@router.post("/resolve-reject", response_model=DecisionOut, status_code=201)
def resolve_with_reject(
    body: RejectDecisionIn,
    user=Depends(require_roles("senior_reviewer", "founder", "admin")),
    db: Session = Depends(get_db),
):
    v = db.get(Video, body.video_id)
    if v is None:
        raise HTTPException(404, "video_not_found")
    if v.status not in ("escalated", "pending"):
        raise HTTPException(409, "not_actionable")
    d = Decision(
        id=ulid(),
        video_id=v.id,
        editor_user_id=user.id,
        action="rejected",
        reject_reason=body.reject_reason,
        reject_reason_detail=body.reject_reason_detail,
    )
    db.add(d)
    v.status = "rejected"
    db.commit()
    db.refresh(d)
    return d
