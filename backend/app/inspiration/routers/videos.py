"""
Videos read API — feeds the queue (Epic 3) and library filters (Epic 4).

US-3.2 queue, US-3.4 metadata, US-3.8 never re-surface decided videos,
US-4.1–4.6 P0 filters, US-2.7 manual override.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.inspiration.auth import current_user, require_roles
from app.inspiration.db import get_db
from app.inspiration.models import Video
from app.inspiration.schemas import ManualVideoIn, SourceChannel, VideoDetail, VideoSummary, VideoStatus
from app.inspiration.util import ulid

router = APIRouter(prefix="/inspiration/videos", tags=["inspiration:queue"])


def _apply_filters(
    q,
    product_id: str | None,
    route_ids: list[str] | None,
    brands: list[str] | None,
    source_channels: list[str] | None,
    min_days_running: int | None,
    duration_bucket: str | None,
    status: str | None,
    aspect_ratios: list[str] | None,
    search: str | None,
):
    if status:
        q = q.filter(Video.status == status)
    if brands:
        q = q.filter(Video.brand.in_(brands))
    if source_channels:
        q = q.filter(Video.source_channel.in_(source_channels))
    if min_days_running is not None:
        # US-4.3 — only applies to sources that report days_running
        q = q.filter(Video.days_running >= min_days_running)
    if duration_bucket:
        bounds = {"3-6": (3, 6), "6-15": (6, 15), "15-30": (15, 30), "30+": (30, None)}.get(duration_bucket)
        if bounds:
            lo, hi = bounds
            q = q.filter(Video.duration_seconds >= lo)
            if hi is not None:
                q = q.filter(Video.duration_seconds < hi)
    if aspect_ratios:
        q = q.filter(Video.aspect_ratio.in_(aspect_ratios))
    if search:
        like = f"%{search}%"
        q = q.filter(
            or_(
                Video.brand.ilike(like),
                Video.title.ilike(like),
                Video.headline.ilike(like),
                Video.primary_text.ilike(like),
                Video.caption.ilike(like),
            )
        )
    # product_id and route_ids only apply when looking at saved references;
    # the queue itself is product-agnostic. The frontend funnels the queue
    # through the product selector by filtering on watchlist product_associations
    # downstream — out of scope for the basic videos list.
    return q


@router.get("", response_model=list[VideoSummary])
def list_videos(
    status: VideoStatus | None = "pending",
    brands: list[str] | None = Query(None),
    source_channels: list[SourceChannel] | None = Query(None),
    min_days_running: int | None = Query(None),
    duration_bucket: str | None = Query(None),
    aspect_ratios: list[str] | None = Query(None),
    search: str | None = Query(None),
    limit: int = Query(50, le=200),
    offset: int = 0,
    db: Session = Depends(get_db),
):
    q = db.query(Video)
    q = _apply_filters(
        q, None, None, brands, source_channels, min_days_running,
        duration_bucket, status, aspect_ratios, search,
    )
    return q.order_by(Video.fetched_at.asc()).offset(offset).limit(limit).all()


@router.get("/{video_id}", response_model=VideoDetail)
def get_video(video_id: str, db: Session = Depends(get_db)):
    v = db.get(Video, video_id)
    if v is None:
        raise HTTPException(404, "video_not_found")
    return v


@router.post("/manual", response_model=VideoSummary, status_code=201)
def add_manual_video(
    body: ManualVideoIn,
    user=Depends(require_roles("ops_lead", "senior_reviewer", "admin", "editor")),
    db: Session = Depends(get_db),
):
    """US-2.7 — manual override. Marked source=manual; jumps to top of FIFO."""
    # Synthetic external id so multiple manual entries can coexist for the
    # same URL.
    ext_id = f"manual:{ulid()}"
    v = Video(
        id=ulid(),
        source_channel="manual",
        source_external_id=ext_id,
        brand=body.brand.strip(),
        headline=body.headline,
        video_url=body.url.strip(),
        publisher_platforms=[body.original_platform] if body.original_platform else None,
        source_published_at=body.source_published_at,
        added_by=user.id,
    )
    db.add(v)
    db.commit()
    db.refresh(v)
    return v
