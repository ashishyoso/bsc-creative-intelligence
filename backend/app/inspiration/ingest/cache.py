"""
US-9.1 — Video caching to own storage (Supabase Storage).

Supabase Storage is S3-compatible. We reuse boto3 against the S3 endpoint
Supabase exposes. Public bucket URLs serve cached videos so the swipe UI
playback isn't dependent on Meta CDN URLs (which expire). On ingest, each
video's source URL is downloaded once, hashed (SHA-256, first 16 hex), and
stored as <hash>.mp4 in the configured bucket.

The bucket must be marked **public** in Supabase Storage settings (so the
public URL serves bytes without auth). Storage access keys come from the
Storage → S3 Settings tab in the Supabase dashboard.

Env:
- SUPABASE_URL                          (e.g. https://abcd.supabase.co)
- SUPABASE_STORAGE_BUCKET               (e.g. inspiration-cache)
- SUPABASE_STORAGE_ACCESS_KEY_ID        (from Storage → S3 Settings)
- SUPABASE_STORAGE_SECRET_ACCESS_KEY
- SUPABASE_STORAGE_REGION               (default: us-east-1; whatever the project is in)
"""
from __future__ import annotations

import hashlib
import logging
import os

log = logging.getLogger("inspiration.cache")


def _client():
    import boto3
    from botocore.config import Config

    supabase_url = os.environ["SUPABASE_URL"].rstrip("/")
    return boto3.client(
        "s3",
        endpoint_url=f"{supabase_url}/storage/v1/s3",
        aws_access_key_id=os.environ["SUPABASE_STORAGE_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["SUPABASE_STORAGE_SECRET_ACCESS_KEY"],
        config=Config(signature_version="s3v4"),
        region_name=os.getenv("SUPABASE_STORAGE_REGION", "us-east-1"),
    )


def _public_url(key: str) -> str:
    supabase_url = os.environ["SUPABASE_URL"].rstrip("/")
    bucket = os.environ["SUPABASE_STORAGE_BUCKET"]
    return f"{supabase_url}/storage/v1/object/public/{bucket}/{key}"


def cache_video(source_url: str, content: bytes) -> tuple[str, str]:
    """Upload <bytes> as <hash>.mp4. Returns (public_url, video_hash)."""
    bucket = os.environ["SUPABASE_STORAGE_BUCKET"]
    full_hash = hashlib.sha256(content).hexdigest()
    short = full_hash[:16]
    key = f"videos/{short}.mp4"
    client = _client()
    client.put_object(
        Bucket=bucket,
        Key=key,
        Body=content,
        ContentType="video/mp4",
        CacheControl="public, max-age=31536000",
    )
    return _public_url(key), full_hash


def evict_rejected_older_than(days: int = 180) -> int:
    """US-9.1 cache eviction. Rejected videos older than <days> have their
    storage object deleted; DB metadata is kept. Returns count evicted."""
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
        client = _client()
        bucket = os.environ["SUPABASE_STORAGE_BUCKET"]
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
