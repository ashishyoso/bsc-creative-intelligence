"""US-1.3 — Manage Source Watchlist."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.inspiration.auth import require_roles
from app.inspiration.db import get_db
from app.inspiration.models import WatchlistEntry
from app.inspiration.schemas import SourceChannel, WatchlistIn, WatchlistOut
from app.inspiration.util import ulid

router = APIRouter(prefix="/inspiration/watchlist", tags=["inspiration:admin"])


@router.get("", response_model=list[WatchlistOut])
def list_watchlist(
    source_channel: SourceChannel | None = Query(None),
    include_inactive: bool = False,
    db: Session = Depends(get_db),
):
    q = db.query(WatchlistEntry)
    if source_channel:
        q = q.filter(WatchlistEntry.source_channel == source_channel)
    if not include_inactive:
        q = q.filter(WatchlistEntry.is_active.is_(True))
    return q.order_by(WatchlistEntry.priority, WatchlistEntry.brand).all()


@router.post("", response_model=WatchlistOut, status_code=201)
def add_watchlist_entry(
    body: WatchlistIn,
    user=Depends(require_roles("admin", "ops_lead")),
    db: Session = Depends(get_db),
):
    entry = WatchlistEntry(
        id=ulid(),
        source_channel=body.source_channel,
        brand=body.brand.strip(),
        source_external_id=body.source_external_id,
        priority=body.priority,
        product_ids=body.product_ids,
        notes=body.notes,
        is_active=True,
        created_by=user.id,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.patch("/{entry_id}", response_model=WatchlistOut)
def update_watchlist_entry(
    entry_id: str,
    body: WatchlistIn,
    user=Depends(require_roles("admin", "ops_lead")),
    db: Session = Depends(get_db),
):
    e = db.get(WatchlistEntry, entry_id)
    if e is None:
        raise HTTPException(404, "watchlist_entry_not_found")
    e.source_channel = body.source_channel
    e.brand = body.brand.strip()
    e.source_external_id = body.source_external_id
    e.priority = body.priority
    e.product_ids = body.product_ids
    e.notes = body.notes
    db.commit()
    db.refresh(e)
    return e


@router.delete("/{entry_id}", status_code=204)
def remove_watchlist_entry(
    entry_id: str,
    user=Depends(require_roles("admin", "ops_lead")),
    db: Session = Depends(get_db),
):
    e = db.get(WatchlistEntry, entry_id)
    if e is None:
        raise HTTPException(404, "watchlist_entry_not_found")
    # Soft-deactivate by default (the spec requires logging adds/removes)
    e.is_active = False
    db.commit()
