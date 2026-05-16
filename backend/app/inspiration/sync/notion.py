"""
US-5.4 — Notion one-way sync.

One Notion database per (product × route). Auto-created on first save to a
new route. On save in the tool: a Notion page is created with video embed,
brand, source, why-it-works, replicability, saved-by, save date, shot
breakdown (if filled), and permalink back to the tool.

Env:
- NOTION_TOKEN
- NOTION_PARENT_PAGE_ID         (workspace parent under which we create DBs)
- INSPIRATION_PUBLIC_URL        (e.g. https://creative.yoso.media)
"""
from __future__ import annotations

import logging
import os
import time
from typing import Optional

import requests
from sqlalchemy.orm import Session

from app.inspiration.db import get_db
from app.inspiration.models import (
    Decision,
    NotionDatabase,
    NotionSyncLog,
    Route,
    ShotBreakdown,
    User,
    Video,
)
from app.inspiration.util import ulid

log = logging.getLogger("inspiration.sync.notion")

NOTION_API = "https://api.notion.com/v1"
NOTION_VERSION = "2022-06-28"


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {os.environ['NOTION_TOKEN']}",
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
    }


# ---------------------------------------------------------- database creation
def _create_database(product_name: str, route_name: str) -> str:
    parent = os.environ["NOTION_PARENT_PAGE_ID"]
    body = {
        "parent": {"type": "page_id", "page_id": parent},
        "title": [{"type": "text", "text": {"content": f"{product_name} — {route_name}"}}],
        "properties": {
            "Name": {"title": {}},
            "Brand": {"rich_text": {}},
            "Source": {"select": {"options": []}},
            "Replicability": {"select": {"options": [
                {"name": "Yes"}, {"name": "Stretch"}, {"name": "No"},
            ]}},
            "Why it works": {"rich_text": {}},
            "Saved by": {"rich_text": {}},
            "Saved at": {"date": {}},
            "Video URL": {"url": {}},
            "Tool permalink": {"url": {}},
        },
    }
    resp = requests.post(f"{NOTION_API}/databases", json=body, headers=_headers(), timeout=30)
    resp.raise_for_status()
    return resp.json()["id"]


def _ensure_database(db: Session, product_id: str, route_id: str) -> str:
    existing = (
        db.query(NotionDatabase)
        .filter(NotionDatabase.product_id == product_id, NotionDatabase.route_id == route_id)
        .first()
    )
    if existing:
        return existing.notion_database_id

    from app.inspiration.models import Product
    p = db.get(Product, product_id)
    r = db.get(Route, route_id)
    if p is None or r is None:
        raise RuntimeError(f"product/route missing: {product_id} / {route_id}")
    notion_db_id = _create_database(p.name, r.name)
    db.add(NotionDatabase(
        id=ulid(), product_id=product_id, route_id=route_id, notion_database_id=notion_db_id,
    ))
    db.commit()
    return notion_db_id


# ----------------------------------------------------------------- page write
def _create_page(notion_db_id: str, payload: dict) -> str:
    body = {"parent": {"database_id": notion_db_id}, "properties": payload["properties"]}
    if payload.get("children"):
        body["children"] = payload["children"]
    resp = requests.post(f"{NOTION_API}/pages", json=body, headers=_headers(), timeout=30)
    resp.raise_for_status()
    return resp.json()["id"]


def _payload_for(d: Decision, v: Video, u: User | None, sb: ShotBreakdown | None) -> dict:
    public_base = os.getenv("INSPIRATION_PUBLIC_URL", "").rstrip("/")
    permalink = f"{public_base}/inspiration/reference/{d.id}" if public_base else None

    def _rt(text: str | None) -> list:
        if not text:
            return []
        return [{"type": "text", "text": {"content": text[:1900]}}]

    props: dict = {
        "Name": {"title": _rt(v.brand + " — " + (v.headline or v.title or v.id))},
        "Brand": {"rich_text": _rt(v.brand)},
        "Source": {"select": {"name": v.source_channel}},
        "Replicability": {"select": {"name": (d.replicability or "yes").capitalize()}},
        "Why it works": {"rich_text": _rt(d.why_text)},
        "Saved by": {"rich_text": _rt(u.name if u else d.editor_user_id)},
        "Saved at": {"date": {"start": d.decided_at.isoformat()}},
        "Video URL": {"url": v.video_url_cached or v.video_url},
    }
    if permalink:
        props["Tool permalink"] = {"url": permalink}

    children = []
    if v.video_url_cached or v.video_url:
        children.append({
            "object": "block",
            "type": "video",
            "video": {"type": "external", "external": {"url": v.video_url_cached or v.video_url}},
        })
    if sb:
        bits = []
        if sb.opening_hook: bits.append(f"**Opening hook:** {sb.opening_hook}")
        if sb.end_frame: bits.append(f"**End frame:** {sb.end_frame}")
        if sb.shot_count: bits.append(f"**Shots:** {sb.shot_count}")
        if sb.camera_type: bits.append(f"**Camera:** {sb.camera_type}")
        if sb.lighting_type: bits.append(f"**Lighting:** {sb.lighting_type}")
        if sb.audio_approach: bits.append(f"**Audio:** {sb.audio_approach}")
        if bits:
            children.append({
                "object": "block",
                "type": "paragraph",
                "paragraph": {"rich_text": _rt("\n".join(bits))},
            })

    return {"properties": props, "children": children}


# --------------------------------------------------------- public entry points
def sync_decision(decision_id: str) -> bool:
    """Sync one saved decision. Returns True on success."""
    if not os.getenv("NOTION_TOKEN"):
        log.warning("NOTION_TOKEN not set; skipping sync for %s", decision_id)
        return False
    gen = get_db()
    db: Session = next(gen)
    try:
        d = db.get(Decision, decision_id)
        if d is None or d.action != "saved" or not d.product_id or not d.route_id:
            return False
        v = db.get(Video, d.video_id)
        u = db.get(User, d.editor_user_id)
        sb = db.get(ShotBreakdown, d.id)
        try:
            notion_db_id = _ensure_database(db, d.product_id, d.route_id)
            payload = _payload_for(d, v, u, sb)  # type: ignore[arg-type]
            page_id = _create_page(notion_db_id, payload)
            db.add(NotionSyncLog(decision_id=d.id, notion_page_id=page_id, ok=True))
            db.commit()
            return True
        except Exception as e:
            log.exception("notion sync failed for %s", decision_id)
            db.add(NotionSyncLog(decision_id=d.id, ok=False, error=str(e)))
            db.commit()
            return False
    finally:
        db.close()


def enqueue_sync(decision_id: str) -> None:
    """Called from FastAPI BackgroundTasks. Best-effort one shot; failures
    are retried by flush_pending on the scheduler."""
    try:
        sync_decision(decision_id)
    except Exception:
        log.exception("notion enqueue_sync wrapper failed for %s", decision_id)


def flush_pending(max_retries: int = 5) -> int:
    """Retry any saved decisions whose latest sync log is failed or missing.
    Exponential backoff via retry_count column."""
    from sqlalchemy import select, func as sa_func

    gen = get_db()
    db: Session = next(gen)
    n = 0
    try:
        # Find saved decisions with no successful sync log
        saved = (
            db.query(Decision.id)
            .filter(Decision.action == "saved")
            .all()
        )
        for (did,) in saved:
            last = (
                db.query(NotionSyncLog)
                .filter(NotionSyncLog.decision_id == did)
                .order_by(NotionSyncLog.synced_at.desc())
                .first()
            )
            if last and last.ok:
                continue
            if last and last.retry_count >= max_retries:
                continue
            # Exponential backoff: wait 2^retry_count minutes
            if last:
                from datetime import datetime, timedelta, timezone
                wait_min = 2 ** last.retry_count
                if datetime.now(timezone.utc) - last.synced_at < timedelta(minutes=wait_min):
                    continue
            ok = sync_decision(did)
            if ok:
                n += 1
            else:
                # bump retry count on the new failed log row we just wrote
                latest = (
                    db.query(NotionSyncLog)
                    .filter(NotionSyncLog.decision_id == did)
                    .order_by(NotionSyncLog.synced_at.desc())
                    .first()
                )
                if latest:
                    latest.retry_count = (last.retry_count + 1) if last else 1
                    db.commit()
        return n
    finally:
        db.close()
