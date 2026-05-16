"""
US-2.2 — Meta Marketing API ingest (BSC own ads).

Cron: daily 04:00 IST.
Endpoint: Marketing API ads + creatives + insights, scoped to BSC + Bombae.
Filter: spend > ₹1,000 in last 90 days.

Marked source='meta_marketing', is_internal=True. Surfaced alongside
competitor ads in the queue (US-3.4 metadata display) and flagged.

Env:
- META_MARKETING_TOKEN
- META_BSC_ACT_ID         (e.g. act_123456)
- META_BOMBAE_ACT_ID
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone

import requests
from sqlalchemy.orm import Session

from app.inspiration.db import get_db
from app.inspiration.ingest.common import record_pull
from app.inspiration.models import Video
from app.inspiration.util import ulid

log = logging.getLogger("inspiration.ingest.meta_marketing")

API = "https://graph.facebook.com/v20.0"


def _get(path: str, token: str, params: dict | None = None) -> dict:
    resp = requests.get(
        f"{API}/{path}",
        params={**(params or {}), "access_token": token},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def _upsert_ad(db: Session, brand: str, ad: dict, insights: dict | None) -> bool:
    ext_id = ad.get("id")
    if not ext_id:
        return False
    existing = (
        db.query(Video)
        .filter(Video.source_channel == "meta_marketing", Video.source_external_id == ext_id)
        .first()
    )
    perf = None
    if insights:
        perf = {
            "spend": float(insights.get("spend", 0) or 0),
            "impressions": int(insights.get("impressions", 0) or 0),
            "ctr": float(insights.get("ctr", 0) or 0),
            "frequency": float(insights.get("frequency", 0) or 0),
            "roas": float((insights.get("purchase_roas") or [{}])[0].get("value", 0) or 0)
                if insights.get("purchase_roas") else None,
            # hook_rate / thumb_stop_ratio need video_play action breakdowns —
            # extracted from `actions` and `video_p25_watched_actions` fields
            # in a real ingest. Skipped in scaffold.
        }
    creative = ad.get("creative") or {}
    video_url = (creative.get("video_id") and f"meta_video:{creative['video_id']}") or creative.get("thumbnail_url") or ""

    if existing:
        existing.performance = perf
        return False

    v = Video(
        id=ulid(),
        source_channel="meta_marketing",
        source_external_id=ext_id,
        brand=brand,
        is_internal=True,
        title=ad.get("name"),
        primary_text=creative.get("body"),
        headline=creative.get("title"),
        cta_text=creative.get("call_to_action_type"),
        video_url=video_url,
        video_thumbnail=creative.get("thumbnail_url"),
        performance=perf,
    )
    db.add(v)
    return True


def _ingest_account(db: Session, act_id: str, brand: str, token: str, counter: dict) -> None:
    """Pull all ads from one ad account with spend > ₹1k in 90d."""
    cursor = None
    while True:
        params = {
            "fields": "id,name,status,creative{id,body,title,thumbnail_url,call_to_action_type,video_id}",
            "limit": 50,
            "filtering": '[{"field":"spend","operator":"GREATER_THAN","value":1000}]',
            "date_preset": "last_90d",
        }
        if cursor:
            params["after"] = cursor
        try:
            data = _get(f"{act_id}/ads", token, params)
        except Exception as e:
            log.exception("meta marketing: account %s page failed", act_id)
            counter["errors"] += 1
            counter["last_error"] = f"{brand}: {e}"
            return
        for ad in data.get("data", []):
            try:
                insights_data = _get(
                    f"{ad['id']}/insights",
                    token,
                    {
                        "fields": "spend,impressions,ctr,frequency,purchase_roas,actions,video_p25_watched_actions",
                        "date_preset": "last_30d",
                    },
                )
                insights = (insights_data.get("data") or [None])[0]
            except Exception as e:
                log.warning("insights fetch failed for ad %s: %s", ad.get("id"), e)
                insights = None
            if _upsert_ad(db, brand, ad, insights):
                counter["records"] += 1
        db.commit()
        cursor = (data.get("paging") or {}).get("cursors", {}).get("after")
        if not cursor:
            break


def run() -> int:
    token = os.getenv("META_MARKETING_TOKEN")
    if not token:
        raise RuntimeError("META_MARKETING_TOKEN not set")

    accounts = [
        ("BSC", os.getenv("META_BSC_ACT_ID")),
        ("Bombae", os.getenv("META_BOMBAE_ACT_ID")),
    ]

    with record_pull("meta_marketing") as counter:
        gen = get_db()
        db: Session = next(gen)
        try:
            for brand, act_id in accounts:
                if not act_id:
                    log.warning("META_*_ACT_ID for %s not set; skipping", brand)
                    continue
                _ingest_account(db, act_id, brand, token, counter)
            return counter["records"]
        finally:
            db.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    print("Ingested", run(), "new internal ads")
