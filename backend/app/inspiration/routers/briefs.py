"""
Brief manifest module (Epic 6).

A creative brief in this tool is intentionally lightweight: title, product,
route, attached references, status, optional external doc URL. Body content
lives elsewhere (Notion / Docs / etc.) or in the inline `notes` field.

The forcing function from US-6.1 is enforced on status transition: a brief
cannot advance to 'approved' until it has at least 2 references that
belong to the brief's stated product + route. References are the saved
Decision rows (action='saved') from Epic 3.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.inspiration.auth import current_user
from app.inspiration.db import get_db
from app.inspiration.models import (
    BriefReference,
    CreativeBrief,
    Decision,
    Product,
    Route,
    ShotBreakdown,
    User,
    Video,
)
from app.inspiration.schemas import (
    BriefDetail,
    BriefIn,
    BriefRefIn,
    BriefReferenceOut,
    BriefSummary,
    ReferenceOut,
    ShotBreakdownOut,
    VideoSummary,
)
from app.inspiration.util import ulid

router = APIRouter(prefix="/inspiration/briefs", tags=["inspiration:briefs"])


def _build_reference(d: Decision, v: Video, route_name: str | None, saved_by_name: str | None, sb: ShotBreakdown | None) -> ReferenceOut:
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


def _summary(brief: CreativeBrief, product_name: str | None, route_name: str | None, ref_count: int) -> BriefSummary:
    return BriefSummary(
        id=brief.id,
        product_id=brief.product_id,
        product_name=product_name,
        route_id=brief.route_id,
        route_name=route_name,
        title=brief.title,
        status=brief.status,  # type: ignore[arg-type]
        external_doc_url=brief.external_doc_url,
        reference_count=ref_count,
        created_at=brief.created_at,
        created_by=brief.created_by,
    )


# ------------------------------------------------------------------- listing
@router.get("", response_model=list[BriefSummary])
def list_briefs(
    product_id: str | None = None,
    route_id: str | None = None,
    status: str | None = Query(None, regex="^(draft|approved)$"),
    db: Session = Depends(get_db),
):
    q = (
        db.query(
            CreativeBrief,
            Product.name.label("product_name"),
            Route.name.label("route_name"),
            func.count(BriefReference.decision_id).label("ref_count"),
        )
        .outerjoin(Product, Product.id == CreativeBrief.product_id)
        .outerjoin(Route, Route.id == CreativeBrief.route_id)
        .outerjoin(BriefReference, BriefReference.brief_id == CreativeBrief.id)
        .group_by(CreativeBrief.id, Product.name, Route.name)
        .order_by(CreativeBrief.created_at.desc())
    )
    if product_id:
        q = q.filter(CreativeBrief.product_id == product_id)
    if route_id:
        q = q.filter(CreativeBrief.route_id == route_id)
    if status:
        q = q.filter(CreativeBrief.status == status)
    return [
        _summary(b, pname, rname, int(refc or 0))
        for b, pname, rname, refc in q.all()
    ]


# -------------------------------------------------------------------- create
@router.post("", response_model=BriefSummary, status_code=201)
def create_brief(
    body: BriefIn,
    user=Depends(current_user),
    db: Session = Depends(get_db),
):
    brief = CreativeBrief(
        id=ulid(),
        product_id=body.product_id,
        route_id=body.route_id,
        title=body.title.strip(),
        external_doc_url=body.external_doc_url,
        goal=body.goal,
        notes=body.notes,
        created_by=user.id,
        status="draft",
    )
    db.add(brief)
    db.commit()
    db.refresh(brief)
    p = db.get(Product, brief.product_id)
    r = db.get(Route, brief.route_id)
    return _summary(brief, p.name if p else None, r.name if r else None, 0)


# -------------------------------------------------------------------- detail
@router.get("/{brief_id}", response_model=BriefDetail)
def get_brief(brief_id: str, db: Session = Depends(get_db)):
    brief = db.get(CreativeBrief, brief_id)
    if brief is None:
        raise HTTPException(404, "brief_not_found")
    p = db.get(Product, brief.product_id)
    r = db.get(Route, brief.route_id)

    rows = (
        db.query(BriefReference, Decision, Video, Route, User, ShotBreakdown)
        .join(Decision, Decision.id == BriefReference.decision_id)
        .join(Video, Video.id == Decision.video_id)
        .outerjoin(Route, Route.id == Decision.route_id)
        .outerjoin(User, User.id == Decision.editor_user_id)
        .outerjoin(ShotBreakdown, ShotBreakdown.decision_id == Decision.id)
        .filter(BriefReference.brief_id == brief_id)
        .order_by(BriefReference.position.asc(), BriefReference.added_at.asc())
        .all()
    )
    references = [
        _build_reference(d, v, rt.name if rt else None, u.name if u else None, sb)
        for _, d, v, rt, u, sb in rows
    ]

    base = _summary(brief, p.name if p else None, r.name if r else None, len(references))
    return BriefDetail(
        **base.model_dump(),
        goal=brief.goal,
        notes=brief.notes,
        references=references,
    )


# -------------------------------------------------------------------- update
@router.patch("/{brief_id}", response_model=BriefSummary)
def update_brief(
    brief_id: str,
    body: BriefIn,
    user=Depends(current_user),
    db: Session = Depends(get_db),
):
    brief = db.get(CreativeBrief, brief_id)
    if brief is None:
        raise HTTPException(404, "brief_not_found")
    brief.title = body.title.strip()
    brief.product_id = body.product_id
    brief.route_id = body.route_id
    brief.external_doc_url = body.external_doc_url
    brief.goal = body.goal
    brief.notes = body.notes
    db.commit()
    db.refresh(brief)
    p = db.get(Product, brief.product_id)
    r = db.get(Route, brief.route_id)
    count = db.query(func.count(BriefReference.decision_id)).filter(BriefReference.brief_id == brief_id).scalar() or 0
    return _summary(brief, p.name if p else None, r.name if r else None, int(count))


# ----------------------------------------------------- attach/detach refs
@router.post("/{brief_id}/references", response_model=BriefReferenceOut, status_code=201)
def attach_reference(
    brief_id: str,
    body: BriefRefIn,
    user=Depends(current_user),
    db: Session = Depends(get_db),
):
    brief = db.get(CreativeBrief, brief_id)
    if brief is None:
        raise HTTPException(404, "brief_not_found")
    d = db.get(Decision, body.decision_id)
    if d is None or d.action != "saved":
        raise HTTPException(404, "reference_not_found")
    existing = (
        db.query(BriefReference)
        .filter(
            BriefReference.brief_id == brief_id,
            BriefReference.decision_id == body.decision_id,
        )
        .first()
    )
    if existing:
        return {"decision_id": existing.decision_id, "position": existing.position, "note": existing.note, "added_at": existing.added_at}
    br = BriefReference(
        brief_id=brief_id,
        decision_id=body.decision_id,
        position=body.position,
        note=body.note,
    )
    db.add(br)
    db.commit()
    return {"decision_id": br.decision_id, "position": br.position, "note": br.note, "added_at": br.added_at}


@router.delete("/{brief_id}/references/{decision_id}", status_code=204)
def detach_reference(
    brief_id: str,
    decision_id: str,
    user=Depends(current_user),
    db: Session = Depends(get_db),
):
    row = (
        db.query(BriefReference)
        .filter(
            BriefReference.brief_id == brief_id,
            BriefReference.decision_id == decision_id,
        )
        .first()
    )
    if row is None:
        return
    db.delete(row)
    db.commit()


# -------------------------------------------------------------- approve gate
@router.post("/{brief_id}/approve", response_model=BriefSummary)
def approve_brief(
    brief_id: str,
    user=Depends(current_user),
    db: Session = Depends(get_db),
):
    """US-6.1 — gate: brief must have ≥2 references and they must belong
    to the brief's product + route."""
    brief = db.get(CreativeBrief, brief_id)
    if brief is None:
        raise HTTPException(404, "brief_not_found")

    rows = (
        db.query(Decision)
        .join(BriefReference, BriefReference.decision_id == Decision.id)
        .filter(
            BriefReference.brief_id == brief_id,
            Decision.action == "saved",
            Decision.product_id == brief.product_id,
            Decision.route_id == brief.route_id,
        )
        .all()
    )
    if len(rows) < 2:
        raise HTTPException(
            422,
            f"brief requires at least 2 saved references from product+route — has {len(rows)}",
        )
    brief.status = "approved"
    brief.approved_at = datetime.now(timezone.utc)
    brief.approved_by = user.id
    db.commit()
    db.refresh(brief)
    p = db.get(Product, brief.product_id)
    r = db.get(Route, brief.route_id)
    return _summary(brief, p.name if p else None, r.name if r else None, len(rows))


# --------------------------- "Used in" backlink for reference detail (US-6.3)
@router.get("/by-reference/{decision_id}", response_model=list[BriefSummary])
def briefs_citing_reference(decision_id: str, db: Session = Depends(get_db)):
    rows = (
        db.query(
            CreativeBrief,
            Product.name.label("pname"),
            Route.name.label("rname"),
        )
        .join(BriefReference, BriefReference.brief_id == CreativeBrief.id)
        .outerjoin(Product, Product.id == CreativeBrief.product_id)
        .outerjoin(Route, Route.id == CreativeBrief.route_id)
        .filter(BriefReference.decision_id == decision_id)
        .order_by(CreativeBrief.created_at.desc())
        .all()
    )
    return [_summary(b, p, rt, 0) for b, p, rt in rows]
