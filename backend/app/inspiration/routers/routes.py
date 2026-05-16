"""US-1.2 — Manage Routes per Product. Versioned; archive-not-delete."""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.inspiration.auth import require_roles
from app.inspiration.db import get_db
from app.inspiration.models import Decision, Route, RouteVersion
from app.inspiration.schemas import RouteIn, RouteOut
from app.inspiration.util import ulid

router = APIRouter(prefix="/inspiration/routes", tags=["inspiration:admin"])


def _snapshot(r: Route) -> dict:
    return {
        "name": r.name,
        "design_tone": r.design_tone,
        "hard_no_list": r.hard_no_list,
        "funnel_split": r.funnel_split,
        "static_format_notes": r.static_format_notes,
        "gif_format_notes": r.gif_format_notes,
        "video_format_notes": r.video_format_notes,
        "version": r.version,
    }


@router.get("", response_model=list[RouteOut])
def list_routes(
    product_id: str = Query(...),
    include_archived: bool = False,
    db: Session = Depends(get_db),
):
    q = db.query(Route).filter(Route.product_id == product_id)
    if not include_archived:
        q = q.filter(Route.is_archived.is_(False))
    return q.order_by(Route.name).all()


@router.post("", response_model=RouteOut, status_code=201)
def create_route(
    body: RouteIn,
    user=Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    r = Route(
        id=ulid(),
        product_id=body.product_id,
        name=body.name.strip(),
        design_tone=body.design_tone,
        hard_no_list=body.hard_no_list,
        funnel_split=body.funnel_split,
        static_format_notes=body.static_format_notes,
        gif_format_notes=body.gif_format_notes,
        video_format_notes=body.video_format_notes,
        version=1,
        is_archived=False,
        created_by=user.id,
    )
    db.add(r)
    db.flush()
    db.add(
        RouteVersion(
            id=ulid(),
            route_id=r.id,
            version=1,
            snapshot=_snapshot(r),
            edited_by=user.id,
        )
    )
    db.commit()
    db.refresh(r)
    return r


@router.patch("/{route_id}", response_model=RouteOut)
def update_route(
    route_id: str,
    body: RouteIn,
    user=Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    r = db.get(Route, route_id)
    if r is None:
        raise HTTPException(404, "route_not_found")
    if r.is_archived:
        raise HTTPException(409, "route_archived")

    # Apply mutations, bump version, then snapshot at the new version
    # (US-1.2). create_route already wrote v1 to route_versions, so writing
    # another row at the same version conflicts on the (route_id, version)
    # unique key. Snapshotting after the bump keeps the history monotonic.
    r.name = body.name.strip()
    r.design_tone = body.design_tone
    r.hard_no_list = body.hard_no_list
    r.funnel_split = body.funnel_split
    r.static_format_notes = body.static_format_notes
    r.gif_format_notes = body.gif_format_notes
    r.video_format_notes = body.video_format_notes
    r.version = r.version + 1
    db.add(
        RouteVersion(
            id=ulid(),
            route_id=r.id,
            version=r.version,
            snapshot=_snapshot(r),
            edited_by=user.id,
        )
    )
    db.commit()
    db.refresh(r)
    return r


@router.delete("/{route_id}", status_code=204)
def archive_route(
    route_id: str,
    user=Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    """US-1.2 — archive if referenced; otherwise hard-delete."""
    r = db.get(Route, route_id)
    if r is None:
        raise HTTPException(404, "route_not_found")
    referenced = db.query(Decision.id).filter(Decision.route_id == route_id).first()
    if referenced:
        r.is_archived = True
        from sqlalchemy import func
        from datetime import datetime, timezone
        r.archived_at = datetime.now(timezone.utc)
        db.commit()
        return
    db.delete(r)
    db.commit()


@router.get("/{route_id}/versions")
def list_route_versions(route_id: str, db: Session = Depends(get_db)):
    rows = (
        db.query(RouteVersion)
        .filter(RouteVersion.route_id == route_id)
        .order_by(RouteVersion.version.desc())
        .all()
    )
    return [
        {
            "version": rv.version,
            "snapshot": rv.snapshot,
            "edited_at": rv.edited_at,
            "edited_by": rv.edited_by,
        }
        for rv in rows
    ]
