"""
Reporting & Intelligence (Epic 7) — P0: US-7.1 decisions log, US-7.2 source
volume, US-7.3 route coverage.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from io import StringIO
import csv

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.inspiration.auth import require_roles
from app.inspiration.db import get_db
from app.inspiration.models import Decision, Product, Route, User, Video
from app.inspiration.schemas import (
    DecisionAction,
    DecisionLogRow,
    RouteCoverageRow,
    SourceChannel,
    SourceVolumeCell,
    SourceVolumeRow,
)

router = APIRouter(prefix="/inspiration/reports", tags=["inspiration:reports"])


# ---------------------------------------------------------------- US-7.1
@router.get("/decisions", response_model=list[DecisionLogRow])
def decisions_log(
    start: datetime | None = None,
    end: datetime | None = None,
    editor_id: str | None = None,
    action: DecisionAction | None = None,
    product_id: str | None = None,
    route_id: str | None = None,
    source_channel: SourceChannel | None = None,
    limit: int = Query(500, le=5000),
    _r=Depends(require_roles("ops_lead", "founder", "admin")),
    db: Session = Depends(get_db),
):
    q = (
        db.query(Decision, Video, User, Product, Route)
        .join(Video, Video.id == Decision.video_id)
        .outerjoin(User, User.id == Decision.editor_user_id)
        .outerjoin(Product, Product.id == Decision.product_id)
        .outerjoin(Route, Route.id == Decision.route_id)
    )
    if start:
        q = q.filter(Decision.decided_at >= start)
    if end:
        q = q.filter(Decision.decided_at <= end)
    if editor_id:
        q = q.filter(Decision.editor_user_id == editor_id)
    if action:
        q = q.filter(Decision.action == action)
    if product_id:
        q = q.filter(Decision.product_id == product_id)
    if route_id:
        q = q.filter(Decision.route_id == route_id)
    if source_channel:
        q = q.filter(Video.source_channel == source_channel)

    rows = q.order_by(Decision.decided_at.desc()).limit(limit).all()
    out: list[DecisionLogRow] = []
    for d, v, u, p, r in rows:
        why_or_reason = (
            d.why_text if d.action == "saved" else
            (d.reject_reason_detail or d.reject_reason) if d.action == "rejected" else
            d.escalation_note
        )
        out.append(
            DecisionLogRow(
                id=d.id,
                decided_at=d.decided_at,
                editor_user_id=d.editor_user_id,
                editor_name=u.name if u else None,
                product_id=d.product_id,
                product_name=p.name if p else None,
                route_id=d.route_id,
                route_name=r.name if r else None,
                action=d.action,  # type: ignore[arg-type]
                brand=v.brand,
                source_channel=v.source_channel,  # type: ignore[arg-type]
                video_url=v.video_url,
                why_or_reason=why_or_reason,
                replicability=d.replicability,  # type: ignore[arg-type]
            )
        )
    return out


@router.get("/decisions.csv")
def decisions_log_csv(
    start: datetime | None = None,
    end: datetime | None = None,
    _r=Depends(require_roles("ops_lead", "founder", "admin")),
    db: Session = Depends(get_db),
):
    rows = decisions_log(start=start, end=end, limit=5000, _r=None, db=db)  # type: ignore[arg-type]
    buf = StringIO()
    w = csv.writer(buf)
    w.writerow([
        "decided_at", "editor", "product", "route", "action",
        "brand", "source", "replicability", "why_or_reason", "video_url",
    ])
    for r in rows:
        w.writerow([
            r.decided_at.isoformat(),
            r.editor_name or r.editor_user_id,
            r.product_name or "",
            r.route_name or "",
            r.action,
            r.brand,
            r.source_channel,
            r.replicability or "",
            (r.why_or_reason or "").replace("\n", " "),
            r.video_url,
        ])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=decisions.csv"},
    )


# ---------------------------------------------------------------- US-7.2
ALL_CHANNELS = ("meta_ad_library", "meta_marketing", "youtube", "tiktok", "brand_site", "manual")


def _iso_week_starts(weeks: int) -> list[date]:
    today = datetime.now(timezone.utc).date()
    monday = today - timedelta(days=today.weekday())
    return [monday - timedelta(weeks=i) for i in range(weeks - 1, -1, -1)]


@router.get("/source-volume", response_model=list[SourceVolumeRow])
def source_volume(
    weeks: int = Query(12, ge=4, le=52),
    _r=Depends(require_roles("ops_lead", "founder", "admin")),
    db: Session = Depends(get_db),
):
    starts = _iso_week_starts(weeks)
    cutoff = datetime.combine(starts[0], datetime.min.time(), tzinfo=timezone.utc)
    rows: list[SourceVolumeRow] = []
    for ch in ALL_CHANNELS:
        per_week_counts: list[SourceVolumeCell] = []
        for ws in starts:
            start_dt = datetime.combine(ws, datetime.min.time(), tzinfo=timezone.utc)
            end_dt = start_dt + timedelta(days=7)
            cnt = (
                db.query(func.count(Video.id))
                .filter(
                    Video.source_channel == ch,
                    Video.fetched_at >= start_dt,
                    Video.fetched_at < end_dt,
                )
                .scalar()
                or 0
            )
            per_week_counts.append(SourceVolumeCell(week_start=ws.isoformat(), count=int(cnt)))
        # Save rate (saved / decided) over the window
        decided = (
            db.query(func.count(Decision.id))
            .join(Video, Video.id == Decision.video_id)
            .filter(Video.source_channel == ch, Decision.decided_at >= cutoff)
            .scalar()
            or 0
        )
        saved = (
            db.query(func.count(Decision.id))
            .join(Video, Video.id == Decision.video_id)
            .filter(
                Video.source_channel == ch,
                Decision.action == "saved",
                Decision.decided_at >= cutoff,
            )
            .scalar()
            or 0
        )
        rate = (saved / decided) if decided > 0 else None
        rows.append(
            SourceVolumeRow(
                source_channel=ch,  # type: ignore[arg-type]
                weekly_counts=per_week_counts,
                save_rate=rate,
            )
        )
    return rows


# ---------------------------------------------------------------- US-7.3
@router.get("/route-coverage", response_model=list[RouteCoverageRow])
def route_coverage(
    product_id: str = Query(...),
    _r=Depends(require_roles("ops_lead", "founder", "admin")),
    db: Session = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    seven_ago = now - timedelta(days=7)
    thirty_ago = now - timedelta(days=30)

    routes = (
        db.query(Route)
        .filter(Route.product_id == product_id, Route.is_archived.is_(False))
        .order_by(Route.name)
        .all()
    )
    out: list[RouteCoverageRow] = []
    for r in routes:
        total = (
            db.query(func.count(Decision.id))
            .filter(
                Decision.route_id == r.id,
                Decision.action == "saved",
            )
            .scalar()
            or 0
        )
        last_7d = (
            db.query(func.count(Decision.id))
            .filter(
                Decision.route_id == r.id,
                Decision.action == "saved",
                Decision.decided_at >= seven_ago,
            )
            .scalar()
            or 0
        )
        last_30d = (
            db.query(func.count(Decision.id))
            .filter(
                Decision.route_id == r.id,
                Decision.action == "saved",
                Decision.decided_at >= thirty_ago,
            )
            .scalar()
            or 0
        )
        out.append(
            RouteCoverageRow(
                route_id=r.id,
                route_name=r.name,
                total_saved=int(total),
                saved_last_7d=int(last_7d),
                saved_last_30d=int(last_30d),
                is_under_served=int(total) < 5,
            )
        )
    return out
