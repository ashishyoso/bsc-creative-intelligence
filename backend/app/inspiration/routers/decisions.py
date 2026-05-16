"""
Decisions — the load-bearing UX (US-3.5 save, US-3.6 reject, US-3.7 escalate).

Save/reject decisions are global (US-3.8) — they remove the video from
every editor's pending queue. The DB-level CHECK constraints enforce
mandatory fields, but we also validate in Python for cleaner errors.
"""
from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from app.inspiration.auth import current_user
from app.inspiration.db import get_db
from app.inspiration.models import Decision, Video
from app.inspiration.schemas import (
    DecisionOut,
    EscalateDecisionIn,
    RejectDecisionIn,
    SaveDecisionIn,
)
from app.inspiration.util import ulid

router = APIRouter(prefix="/inspiration/decisions", tags=["inspiration:queue"])


def _ensure_pending(v: Video):
    if v.status != "pending":
        # US-3.8 — once decided, never re-surface. Returning 409 keeps the
        # frontend honest if two editors race on the same video.
        raise HTTPException(409, "video_already_decided")


@router.post("/save", response_model=DecisionOut, status_code=201)
def save_video(
    body: SaveDecisionIn,
    background: BackgroundTasks,
    user=Depends(current_user),
    db: Session = Depends(get_db),
):
    v = db.get(Video, body.video_id)
    if v is None:
        raise HTTPException(404, "video_not_found")
    _ensure_pending(v)

    primary = Decision(
        id=ulid(),
        video_id=v.id,
        editor_user_id=user.id,
        action="saved",
        product_id=body.product_id,
        route_id=body.route_id,
        replicability=body.replicability,
        why_text=body.why_text,
    )
    db.add(primary)
    db.flush()

    # US-3.9 cross-product saves — each creates an additional Decision row
    # with cross_product_origin_id pointing at the primary save.
    for extra in body.cross_product_saves:
        pid = extra.get("product_id")
        rid = extra.get("route_id")
        if not pid or not rid:
            continue
        db.add(
            Decision(
                id=ulid(),
                video_id=v.id,
                editor_user_id=user.id,
                action="saved",
                product_id=pid,
                route_id=rid,
                replicability=body.replicability,
                why_text=body.why_text,
                cross_product_origin_id=primary.id,
            )
        )

    v.status = "saved"
    db.commit()
    db.refresh(primary)

    # US-5.4 Notion sync runs in background; failures retried via sync log
    from app.inspiration.sync.notion import enqueue_sync
    background.add_task(enqueue_sync, primary.id)

    return primary


@router.post("/reject", response_model=DecisionOut, status_code=201)
def reject_video(
    body: RejectDecisionIn,
    user=Depends(current_user),
    db: Session = Depends(get_db),
):
    v = db.get(Video, body.video_id)
    if v is None:
        raise HTTPException(404, "video_not_found")
    _ensure_pending(v)

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


@router.post("/escalate", response_model=DecisionOut, status_code=201)
def escalate_video(
    body: EscalateDecisionIn,
    user=Depends(current_user),
    db: Session = Depends(get_db),
):
    v = db.get(Video, body.video_id)
    if v is None:
        raise HTTPException(404, "video_not_found")
    _ensure_pending(v)

    d = Decision(
        id=ulid(),
        video_id=v.id,
        editor_user_id=user.id,
        action="escalated",
        escalation_note=body.escalation_note,
    )
    db.add(d)
    v.status = "escalated"
    db.commit()
    db.refresh(d)
    return d


@router.post("/{decision_id}/undo", status_code=204)
def undo_decision(
    decision_id: str,
    user=Depends(current_user),
    db: Session = Depends(get_db),
):
    """
    US-3.8 — Ops Lead can un-decide a video. Reverts video.status='pending'
    and deletes the Decision row. Logged via the standard request log.
    """
    from app.inspiration.auth import assert_any_role
    assert_any_role(db, user.id, {"ops_lead", "admin"})

    d = db.get(Decision, decision_id)
    if d is None:
        raise HTTPException(404, "decision_not_found")
    v = db.get(Video, d.video_id)
    # Delete cross-product children if undoing a primary save
    db.query(Decision).filter(Decision.cross_product_origin_id == d.id).delete()
    db.delete(d)
    if v is not None:
        v.status = "pending"
    db.commit()
