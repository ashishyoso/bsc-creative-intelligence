"""
US-9.1 — Video caching to own storage (Cloudflare R2).

R2 is S3-compatible. We use boto3 against the R2 endpoint. Public bucket
URLs serve cached videos so the swipe UI playback isn't dependent on Meta
CDN URLs (which expire). On ingest, each video's source URL is downloaded
once, hashed (SHA-256, first 16 hex), and stored as <hash>.mp4 in R2.

Env:
- R2_ACCOUNT_ID
- R2_ACCESS_KEY_ID
- R2_SECRET_ACCESS_KEY
- R2_BUCKET                 (e.g. bsc-inspiration-cache)
- R2_PUBLIC_BASE            (e.g. https://cache.creative.yoso.media)
"""
from __future__ import annotations

import hashlib
import logging
import os
from typing import Optional

log = logging.getLogger("inspiration.cache")


def _r2_client():
    import boto3
    from botocore.config import Config

    return boto3.client(
        "s3",
        endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )


def cache_video(source_url: str, content: bytes) -> tuple[str, str]:
    """Upload <bytes> as <hash>.mp4 to R2. Returns (cached_url, video_hash)."""
    bucket = os.environ["R2_BUCKET"]
    public_base = os.environ["R2_PUBLIC_BASE"].rstrip("/")
    full_hash = hashlib.sha256(content).hexdigest()
    short = full_hash[:16]
    key = f"videos/{short}.mp4"
    client = _r2_client()
    client.put_object(
        Bucket=bucket,
        Key=key,
        Body=content,
        ContentType="video/mp4",
        CacheControl="public, max-age=31536000",
    )
    return f"{public_base}/{key}", full_hash


def evict_rejected_older_than(days: int = 180) -> int:
    """Cache eviction policy (US-9.1): rejected videos older than 180 days
    have their R2 objects deleted; DB metadata is kept. Returns count
    evicted."""
    from datetime import datetime, timedelta, timezone

    from app.inspiration.db import get_db
    from app.inspiration.models import Decision, Video

    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    gen = get_db()
    db = next(gen)
    try:
        candidates = (
            db.query(Video)
            .join(Decision, Decision.video_id == Video.id)
            .filter(
                Video.status == "rejected",
                Video.video_url_cached.isnot(None),
                Decision.decided_at < cutoff,
            )
            .all()
        )
        client = _r2_client()
        bucket = os.environ["R2_BUCKET"]
        n = 0
        for v in candidates:
            if not v.video_url_cached or not v.video_hash:
                continue
            key = f"videos/{v.video_hash[:16]}.mp4"
            try:
                client.delete_object(Bucket=bucket, Key=key)
                v.video_url_cached = None
                n += 1
            except Exception:
                log.exception("evict failed for video %s", v.id)
        db.commit()
        return n
    finally:
        db.close()
