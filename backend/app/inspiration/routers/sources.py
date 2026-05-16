"""US-2.6 — Source Health Dashboard + manual trigger endpoints for testing."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.inspiration.auth import require_roles
from app.inspiration.db import get_db
from app.inspiration.models import SourcePull, Video
from app.inspiration.schemas import SourceHealth

log = logging.getLogger("inspiration.sources")

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


# --- manual trigger for one-off testing of an ingest worker -----------------
# Runs the worker inline (not via the scheduler) so the response carries
# the result + any error. Synchronous — caller waits. Useful before
# enabling INSPIRATION_SCHEDULER=on globally.
@router.post("/{source}/trigger")
def trigger_ingest(
    source: str,
    user=Depends(require_roles("ops_lead", "admin")),
):
    if source not in ("meta_ad_library", "meta_marketing", "youtube", "tiktok", "brand_site"):
        raise HTTPException(400, f"unknown source: {source}")
    try:
        if source == "meta_ad_library":
            from app.inspiration.ingest import meta_ad_library as worker
        elif source == "meta_marketing":
            from app.inspiration.ingest import meta_marketing as worker
        elif source == "youtube":
            from app.inspiration.ingest import youtube as worker
        elif source == "tiktok":
            from app.inspiration.ingest import tiktok as worker
        else:  # brand_site
            from app.inspiration.ingest import brand_sites as worker
        records = worker.run()
        return {"source": source, "ok": True, "records": records}
    except Exception as e:
        log.exception("manual ingest %s failed", source)
        return {"source": source, "ok": False, "error": f"{type(e).__name__}: {e}"}
