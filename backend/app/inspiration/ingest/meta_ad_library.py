"""
US-2.1 — Meta Ad Library API ingest (EU/UK arbitrage).

Cron: daily 03:00 IST.
Endpoint: graph.facebook.com/v20.0/ads_archive
Per-brand try/except; rate limit ≤200 calls/hour with backoff on 429.

Env:
- META_AD_LIBRARY_TOKEN
"""
from __future__ import annotations

import logging
import os
import time
from datetime import datetime, timezone
from typing import Iterable

import requests
from sqlalchemy.orm import Session

from app.inspiration.db import get_db
from app.inspiration.ingest.common import record_pull
from app.inspiration.models import Video, WatchlistEntry
from app.inspiration.util import ulid

log = logging.getLogger("inspiration.ingest.meta_ad_library")

GRAPH_URL = "https://graph.facebook.com/v20.0/ads_archive"
COUNTRIES = "GB,DE,FR,ES,IT,NL,IE,PT"
FIELDS = ",".join([
    "id", "page_name", "page_id", "ad_creation_time",
    "ad_delivery_start_time", "ad_delivery_stop_time",
    "publisher_platforms", "ad_creative_bodies", "ad_creative_link_titles",
    "ad_creative_link_captions", "ad_creative_link_descriptions",
    "ad_creative_link_cta_text", "ad_snapshot_url",
    "languages", "target_locations",
])


def _request_with_backoff(params: dict) -> dict:
    for attempt in range(5):
        resp = requests.get(GRAPH_URL, params=params, timeout=30)
        if resp.status_code == 429:
            sleep_s = 2 ** attempt
            log.warning("rate-limited, sleeping %ss", sleep_s)
            time.sleep(sleep_s)
            continue
        resp.raise_for_status()
        return resp.json()
    raise RuntimeError("meta ad library: rate-limit retry exhausted")


def _parse_dt(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


def _days_running(start: datetime | None, stop: datetime | None) -> int | None:
    if start is None:
        return None
    end = stop or datetime.now(timezone.utc)
    return max(0, (end.date() - start.date()).days)


def _upsert_video(db: Session, brand: str, page_id: str, item: dict) -> bool:
    """Upsert one ad item. Returns True if a new row was created."""
    ext_id = item.get("id")
    if not ext_id:
        return False
    existing = (
        db.query(Video)
        .filter(Video.source_channel == "meta_ad_library", Video.source_external_id == ext_id)
        .first()
    )
    start = _parse_dt(item.get("ad_delivery_start_time"))
    stop = _parse_dt(item.get("ad_delivery_stop_time"))
    body = (item.get("ad_creative_bodies") or [None])[0]
    headline = (item.get("ad_creative_link_titles") or [None])[0]
    caption = (item.get("ad_creative_link_captions") or [None])[0]
    descr = (item.get("ad_creative_link_descriptions") or [None])[0]
    cta = (item.get("ad_creative_link_cta_text") or [None])[0]
    if existing:
        # Only refresh days_running / delivery_stop on subsequent sightings
        existing.days_running = _days_running(start, stop)
        existing.delivery_stop_at = stop
        return False
    v = Video(
        id=ulid(),
        source_channel="meta_ad_library",
        source_external_id=ext_id,
        brand=brand,
        is_internal=False,
        primary_text=body,
        headline=headline,
        link_caption=caption,
        link_description=descr,
        cta_text=cta,
        video_url=item.get("ad_snapshot_url", ""),  # snapshot; cached after R2 fetch
        publisher_platforms=item.get("publisher_platforms"),
        languages=item.get("languages"),
        countries=[c.get("name") for c in (item.get("target_locations") or []) if c.get("name")],
        source_published_at=_parse_dt(item.get("ad_creation_time")),
        delivery_start_at=start,
        delivery_stop_at=stop,
        days_running=_days_running(start, stop),
    )
    db.add(v)
    return True


def run() -> int:
    """Entry point for the daily cron. Returns total new videos ingested."""
    token = os.getenv("META_AD_LIBRARY_TOKEN")
    if not token:
        raise RuntimeError("META_AD_LIBRARY_TOKEN not set")

    with record_pull("meta_ad_library") as counter:
        gen = get_db()
        db: Session = next(gen)
        try:
            brands: Iterable[WatchlistEntry] = (
                db.query(WatchlistEntry)
                .filter(
                    WatchlistEntry.source_channel == "meta_ad_library",
                    WatchlistEntry.is_active.is_(True),
                )
                .all()
            )
            for entry in brands:
                try:
                    cursor = None
                    while True:
                        params = {
                            "access_token": token,
                            "ad_type": "ALL",
                            "ad_active_status": "ACTIVE",
                            "ad_reached_countries": COUNTRIES,
                            "media_type": "VIDEO",
                            "fields": FIELDS,
                            "limit": 50,
                        }
                        # Prefer page ID when available; fall back to brand-name search.
                        if entry.source_external_id:
                            params["search_page_ids"] = entry.source_external_id
                        else:
                            params["search_terms"] = entry.brand
                        if cursor:
                            params["after"] = cursor
                        data = _request_with_backoff(params)
                        for item in data.get("data", []):
                            if _upsert_video(db, entry.brand, entry.source_external_id, item):
                                counter["records"] += 1
                        db.commit()
                        cursor = (data.get("paging") or {}).get("cursors", {}).get("after")
                        if not cursor:
                            break
                except Exception as e:
                    log.exception("meta ad library: brand %s failed", entry.brand)
                    counter["errors"] += 1
                    counter["last_error"] = f"{entry.brand}: {e}"
            return counter["records"]
        finally:
            db.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    print("Ingested", run(), "new ads")
