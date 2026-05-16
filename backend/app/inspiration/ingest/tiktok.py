"""
US-2.4 — TikTok Creative Center Top Ads (weekly Mon 06:00 IST).

The spec marks this source 'semi-documented — accept fragility; alert on
schema changes.' Treat as best-effort: skeleton uses requests against the
public Creative Center endpoints (subject to break), parses what it can,
flags failures via SourcePull.last_error.

If TikTok ships a stable public API, this should be swapped for it.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

import requests
from sqlalchemy.orm import Session

from app.inspiration.db import get_db
from app.inspiration.ingest.common import record_pull
from app.inspiration.models import Video
from app.inspiration.util import ulid

log = logging.getLogger("inspiration.ingest.tiktok")

# Creative Center exposes JSON endpoints behind its public dashboard. URLs
# and field names are not contract-stable; treat as fragile.
URL = "https://ads.tiktok.com/business/creativecenter/inspiration/topads/pc/en/api/v2/list"
COUNTRIES = ("IN", "US", "GB")
INDUSTRY = "Beauty & Personal Care"


def _fetch(country: str) -> list[dict]:
    """Try one country. Returns parsed item list or raises."""
    params = {
        "period": 30,
        "country_code": country,
        "industry": INDUSTRY,
        "objective": "all",
        "page": 1,
        "limit": 50,
    }
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "application/json, text/plain, */*",
    }
    resp = requests.get(URL, params=params, headers=headers, timeout=30)
    resp.raise_for_status()
    payload = resp.json()
    # Endpoint may wrap under data/materials, data/list, or similar — try a few
    materials = (
        payload.get("data", {}).get("materials") or
        payload.get("data", {}).get("list") or
        []
    )
    return materials


def _upsert(db: Session, country: str, rank: int, item: dict) -> bool:
    ext_id = item.get("id") or item.get("video_info", {}).get("vid")
    if not ext_id:
        return False
    ext_id = f"tt:{country}:{ext_id}"
    if db.query(Video).filter(
        Video.source_channel == "tiktok",
        Video.source_external_id == ext_id,
    ).first():
        return False
    advertiser = item.get("brand_name") or item.get("advertiser_name") or "unknown"
    video_info = item.get("video_info") or {}
    v = Video(
        id=ulid(),
        source_channel="tiktok",
        source_external_id=ext_id,
        brand=advertiser,
        title=item.get("brand_name"),
        video_url=video_info.get("video_url") or video_info.get("play_url") or "",
        video_thumbnail=video_info.get("cover_url"),
        duration_seconds=video_info.get("duration"),
        countries=[country],
        like_count=item.get("like"),
        comment_count=item.get("comment"),
        days_running=item.get("days") or item.get("days_run"),
        publisher_platforms=["tiktok"],
        source_published_at=datetime.now(timezone.utc),
    )
    db.add(v)
    return True


def run() -> int:
    with record_pull("tiktok") as counter:
        gen = get_db()
        db: Session = next(gen)
        try:
            for country in COUNTRIES:
                try:
                    items = _fetch(country)
                    for i, it in enumerate(items):
                        if _upsert(db, country, i + 1, it):
                            counter["records"] += 1
                    db.commit()
                except Exception as e:
                    log.exception("tiktok: country %s failed", country)
                    counter["errors"] += 1
                    counter["last_error"] = f"{country}: {e}"
            return counter["records"]
        finally:
            db.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    print("Ingested", run(), "new TikTok Top Ads")
