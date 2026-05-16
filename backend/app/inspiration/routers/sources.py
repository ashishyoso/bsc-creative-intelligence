"""US-2.6 — Source Health Dashboard."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.inspiration.db import get_db
from app.inspiration.models import SourcePull, Video
from app.inspiration.schemas import SourceHealth

router = APIRouter(prefix="/inspiration/sources", tags=["inspiration:ops"])

ALL_CHANNELS = ("meta_ad_library", "meta_marketing", "youtube", "tiktok", "brand_site", "manual")


def _health(last_pull_at: datetime | None, last_error: str | None) -> str:
    if last_pull_at is None:
        return "red"
    age_hours = (datetime.now(timezone.utc) - last_pull_at).total_seconds() / 3600
    if last_error and age_hours > 24:
        return "red"
    if age_hours <= 24:
        return "green"
    if age_hours <= 48:
        return "amber"
    return "red"


@router.get("/health", response_model=list[SourceHealth])
def source_health(db: Session = Depends(get_db)):
    out: list[SourceHealth] = []
    seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)
    for ch in ALL_CHANNELS:
        last = (
            db.query(SourcePull)
            .filter(SourcePull.source_channel == ch)
            .order_by(SourcePull.started_at.desc())
            .first()
        )
        seven_day_total = (
            db.query(func.count(Video.id))
            .filter(Video.source_channel == ch, Video.fetched_at >= seven_days_ago)
            .scalar()
            or 0
        )
        err_count_30d = (
            db.query(func.count(SourcePull.id))
            .filter(
                SourcePull.source_channel == ch,
                SourcePull.error_count > 0,
                SourcePull.started_at >= datetime.now(timezone.utc) - timedelta(days=30),
            )
            .scalar()
            or 0
        )
        last_at = last.started_at if last else None
        last_err = last.last_error if last else None
        out.append(
            SourceHealth(
                source_channel=ch,  # type: ignore[arg-type]
                last_pull_at=last_at,
                last_pull_records=last.records_pulled if last else None,
                seven_day_records=int(seven_day_total),
                error_count=int(err_count_30d),
                last_error=last_err,
                health=_health(last_at, last_err),  # type: ignore[arg-type]
            )
        )
    return out
