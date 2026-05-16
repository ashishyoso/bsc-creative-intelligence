"""
US-2.3 — YouTube Data API v3 ingest.

Cron: daily 05:00 IST.
For each watchlisted channel: last 30 days on first run, last 24h after.
Filter: duration < 90 seconds.

Env:
- YOUTUBE_API_KEY
"""
from __future__ import annotations

import logging
import os
import re
from datetime import datetime, timedelta, timezone

import requests
from sqlalchemy.orm import Session

from app.inspiration.db import get_db
from app.inspiration.ingest.common import record_pull
from app.inspiration.models import Video, WatchlistEntry
from app.inspiration.util import ulid

log = logging.getLogger("inspiration.ingest.youtube")

API = "https://www.googleapis.com/youtube/v3"


def _get(path: str, params: dict) -> dict:
    resp = requests.get(f"{API}/{path}", params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()


def _iso8601_duration_to_seconds(iso: str | None) -> int | None:
    if not iso:
        return None
    m = re.fullmatch(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", iso)
    if not m:
        return None
    h, mi, s = (int(g or 0) for g in m.groups())
    return h * 3600 + mi * 60 + s


def _upsert(db: Session, brand: str, item: dict) -> bool:
    vid = item["id"]
    sn = item["snippet"]
    cd = item["contentDetails"]
    st = item.get("statistics", {})
    duration = _iso8601_duration_to_seconds(cd.get("duration"))
    if duration is not None and duration > 90:
        return False  # spec: skip long-form
    existing = (
        db.query(Video)
        .filter(Video.source_channel == "youtube", Video.source_external_id == vid)
        .first()
    )
    if existing:
        existing.view_count = int(st.get("viewCount", existing.view_count or 0))
        existing.like_count = int(st.get("likeCount", existing.like_count or 0))
        existing.comment_count = int(st.get("commentCount", existing.comment_count or 0))
        return False
    v = Video(
        id=ulid(),
        source_channel="youtube",
        source_external_id=vid,
        brand=brand,
        title=sn.get("title"),
        primary_text=sn.get("description"),
        video_url=f"https://www.youtube.com/watch?v={vid}",
        video_thumbnail=(sn.get("thumbnails") or {}).get("high", {}).get("url"),
        duration_seconds=duration,
        languages=[sn["defaultLanguage"]] if sn.get("defaultLanguage") else None,
        source_published_at=datetime.fromisoformat(sn["publishedAt"].replace("Z", "+00:00"))
            if sn.get("publishedAt") else None,
        view_count=int(st.get("viewCount", 0)) if st.get("viewCount") else None,
        like_count=int(st.get("likeCount", 0)) if st.get("likeCount") else None,
        comment_count=int(st.get("commentCount", 0)) if st.get("commentCount") else None,
    )
    db.add(v)
    return True


def _resolve_channel_id(brand: str, hint: str | None, key: str) -> str | None:
    """If hint looks like a YouTube channel ID (UCxxxxxxxxxxxx), use it.
    Otherwise look up by brand name via the search API and take the top
    channel result. Returns None if nothing found."""
    if hint and hint.startswith("UC") and len(hint) >= 22:
        return hint
    query = hint or brand
    try:
        resp = _get("search", {
            "key": key,
            "part": "snippet",
            "q": query,
            "type": "channel",
            "maxResults": 1,
        })
        items = resp.get("items", [])
        if not items:
            return None
        return items[0].get("id", {}).get("channelId") or items[0].get("snippet", {}).get("channelId")
    except Exception:
        log.exception("youtube: channel lookup failed for %s", brand)
        return None


def _ingest_channel(db: Session, brand: str, channel_hint: str | None, key: str, since: datetime, counter: dict) -> None:
    try:
        channel_id = _resolve_channel_id(brand, channel_hint, key)
        if not channel_id:
            log.warning("youtube: no channel resolved for %s (hint=%s)", brand, channel_hint)
            return
        search = _get(
            "search",
            {
                "key": key,
                "part": "id",
                "channelId": channel_id,
                "type": "video",
                "order": "date",
                "publishedAfter": since.isoformat().replace("+00:00", "Z"),
                "maxResults": 50,
            },
        )
        video_ids = [i["id"]["videoId"] for i in search.get("items", []) if i.get("id", {}).get("videoId")]
        if not video_ids:
            return
        videos = _get(
            "videos",
            {
                "key": key,
                "part": "snippet,contentDetails,statistics",
                "id": ",".join(video_ids),
            },
        )
        for item in videos.get("items", []):
            if _upsert(db, brand, item):
                counter["records"] += 1
        db.commit()
    except Exception as e:
        log.exception("youtube: channel for %s failed", brand)
        counter["errors"] += 1
        counter["last_error"] = f"{brand}: {e}"


def run(first_run: bool = False) -> int:
    key = os.getenv("YOUTUBE_API_KEY")
    if not key:
        raise RuntimeError("YOUTUBE_API_KEY not set")
    since = datetime.now(timezone.utc) - timedelta(days=30 if first_run else 1)

    with record_pull("youtube") as counter:
        gen = get_db()
        db: Session = next(gen)
        try:
            entries = (
                db.query(WatchlistEntry)
                .filter(
                    WatchlistEntry.source_channel == "youtube",
                    WatchlistEntry.is_active.is_(True),
                )
                .all()
            )
            for entry in entries:
                # source_external_id is optional now — falls back to search by brand
                _ingest_channel(db, entry.brand, entry.source_external_id, key, since, counter)
            return counter["records"]
        finally:
            db.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    import sys
    print("Ingested", run(first_run="--first-run" in sys.argv), "new YouTube videos")
