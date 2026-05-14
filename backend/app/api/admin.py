"""Admin endpoints — one-shot maintenance ops for production.

These are dangerous when misfired (re-download GB of video, re-extract frames
on 1000 assets). Each one is idempotent. Each returns a job_id so the long-
running work happens off the request thread.
"""
from __future__ import annotations

import asyncio
import logging
import shutil
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.db.models import Asset, AutoTag, MappingStatus
from app.db.session import SessionLocal, get_db
from app.ingest.downloader import _ext_from_mime, _guess_mime, ffprobe
from app.jobs import submit
from app.tagging.frames import extract_frames, extract_single_image
from app.tagging.pipeline import tag_asset

log = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


# ----------------------- Rehydrate vault --------------------------------

async def _rehydrate_one(client: httpx.AsyncClient, asset: Asset) -> tuple[bool, str]:
    """Download a single asset from its mapping_key (CDN URL) into VAULT_ROOT.

    Writes the file as `videos/{asset_id}{ext}` (or `videos/{asset_id}.webp` etc).
    Updates Asset.storage_path to the relative path."""
    if not asset.mapping_key:
        return False, "no_mapping_key"
    if not asset.asset_id:
        return False, "no_asset_id"

    # Choose extension from existing storage_path if possible, else from URL
    target_ext = ""
    if asset.storage_path:
        target_ext = Path(asset.storage_path).suffix
    if not target_ext:
        target_ext = Path(asset.mapping_key).suffix.split("?")[0]
    if not target_ext or len(target_ext) > 6:
        target_ext = ".mp4" if asset.asset_type == "video" else ".webp"

    dest = settings.videos_dir / f"{asset.asset_id}{target_ext}"
    if dest.exists() and dest.stat().st_size > 1000:
        return True, "already_present"

    try:
        async with client.stream("GET", asset.mapping_key) as response:
            response.raise_for_status()
            with dest.open("wb") as f:
                async for chunk in response.aiter_bytes(chunk_size=1024 * 256):
                    f.write(chunk)
        return True, "downloaded"
    except Exception as e:
        return False, f"error:{type(e).__name__}:{str(e)[:120]}"


async def _rehydrate_all_async(job, only_missing: bool, limit: int | None):
    session = SessionLocal()
    try:
        q = session.query(Asset).filter(Asset.download_status == "downloaded")
        assets = q.limit(limit).all() if limit else q.all()
    finally:
        session.close()

    job.progress["total"] = len(assets)
    job.progress["done"] = 0
    job.progress["downloaded"] = 0
    job.progress["already_present"] = 0
    job.progress["errors"] = 0

    sem = asyncio.Semaphore(8)
    async with httpx.AsyncClient(timeout=httpx.Timeout(300), follow_redirects=True) as client:
        async def _bounded(asset):
            async with sem:
                if only_missing:
                    path_str = asset.storage_path or ""
                    candidate_paths = [
                        Path(path_str),
                        settings.vault_root / path_str,
                        settings.videos_dir / Path(path_str).name,
                    ]
                    if any(p.exists() and p.stat().st_size > 1000 for p in candidate_paths):
                        job.progress["already_present"] += 1
                        job.progress["done"] += 1
                        return
                ok, status = await _rehydrate_one(client, asset)
                if ok:
                    if status == "downloaded":
                        job.progress["downloaded"] += 1
                    else:
                        job.progress["already_present"] += 1
                    # Update DB to relative path
                    s = SessionLocal()
                    try:
                        a = s.get(Asset, asset.asset_id)
                        if a:
                            target_ext = Path(asset.mapping_key).suffix.split("?")[0]
                            if not target_ext or len(target_ext) > 6:
                                target_ext = ".mp4" if a.asset_type == "video" else ".webp"
                            a.storage_path = f"videos/{asset.asset_id}{target_ext}"
                            # Also re-probe for missing dimensions
                            if not a.actual_width or not a.actual_height:
                                probe = ffprobe(settings.vault_root / a.storage_path)
                                if probe.width: a.actual_width = probe.width
                                if probe.height: a.actual_height = probe.height
                                if a.asset_type == "video" and probe.duration_seconds and not a.actual_duration_seconds:
                                    a.actual_duration_seconds = probe.duration_seconds
                            s.commit()
                    finally:
                        s.close()
                else:
                    job.progress["errors"] += 1
                    job.progress.setdefault("error_samples", [])
                    if len(job.progress["error_samples"]) < 10:
                        job.progress["error_samples"].append({"asset_id": asset.asset_id, "reason": status})
                job.progress["done"] += 1

        await asyncio.gather(*[_bounded(a) for a in assets])

    return job.progress


@router.post("/rehydrate-vault")
def rehydrate_vault(only_missing: bool = True, limit: int | None = None):
    """Re-download every Asset's file from its mapping_key (CDN URL).

    only_missing=True (default): skip assets whose file is already on disk.
    Use limit=N for a partial test run.
    """
    async def _work(job):
        job.phase = "rehydrating"
        return await _rehydrate_all_async(job, only_missing=only_missing, limit=limit)
    j = submit(name="rehydrate_vault", target=_work, is_async=True)
    return {"job_id": j.id, "status": j.status}


# ----------------------- Rebuild frames ---------------------------------

@router.post("/rebuild-frames")
def rebuild_frames(only_missing: bool = True, limit: int | None = None):
    """Re-extract frames for every tagged asset (no LLM, just ffmpeg)."""

    def _work(job):
        job.phase = "rebuilding_frames"
        session = SessionLocal()
        try:
            q = (
                session.query(Asset, AutoTag)
                .join(AutoTag, AutoTag.asset_id == Asset.asset_id)
                .filter(Asset.download_status == "downloaded")
            )
            rows = q.limit(limit).all() if limit else q.all()
        finally:
            session.close()

        job.progress["total"] = len(rows)
        job.progress["done"] = 0
        job.progress["extracted"] = 0
        job.progress["skipped"] = 0
        job.progress["errors"] = 0

        for asset, tag in rows:
            job.progress["done"] += 1
            try:
                storage = asset.storage_path or ""
                src = Path(storage)
                if not src.is_absolute():
                    src = settings.vault_root / storage
                if not src.exists():
                    job.progress["errors"] += 1
                    continue

                frame_dir = settings.frames_dir / asset.asset_id
                if only_missing and frame_dir.exists() and any(frame_dir.iterdir()):
                    job.progress["skipped"] += 1
                    continue

                if asset.asset_type == "image":
                    frames = extract_single_image(src, asset_id=asset.asset_id)
                else:
                    duration = asset.actual_duration_seconds or 0.0
                    if duration <= 0:
                        probe = ffprobe(src)
                        duration = probe.duration_seconds or 0.0
                    frames = extract_frames(src, asset_id=asset.asset_id, actual_duration=duration)
                if frames:
                    job.progress["extracted"] += 1
                else:
                    job.progress["errors"] += 1
            except Exception as e:
                log.warning("rebuild-frames failed for %s: %s", asset.asset_id, e)
                job.progress["errors"] += 1
        return job.progress

    j = submit(name="rebuild_frames", target=_work, is_async=False)
    return {"job_id": j.id, "status": j.status}


# ----------------------- Retry failed tags ------------------------------

@router.post("/retry-failed-tags")
def retry_failed_tags(asset_ids: list[str] | None = None):
    """Re-run autotag for a specific list of asset_ids, or every eligible asset
    without an autotag record."""

    def _work(job):
        job.phase = "retrying_tags"
        session = SessionLocal()
        try:
            if asset_ids:
                ids = list(asset_ids)
            else:
                ids = [
                    a.asset_id
                    for (a,) in session.query(Asset.asset_id)
                    .outerjoin(AutoTag, AutoTag.asset_id == Asset.asset_id)
                    .filter(Asset.download_status == "downloaded")
                    .filter(Asset.mapping_status.in_([MappingStatus.VERIFIED.value, MappingStatus.MANUALLY_CONFIRMED.value]))
                    .filter(AutoTag.id.is_(None))
                    .all()
                ]
        finally:
            session.close()

        job.progress["total"] = len(ids)
        job.progress["done"] = 0
        job.progress["ok"] = 0
        job.progress["failed"] = 0
        job.progress["cost_inr"] = 0.0

        for asset_id in ids:
            res = tag_asset(asset_id)
            job.progress["done"] += 1
            if res.get("ok"):
                job.progress["ok"] += 1
                job.progress["cost_inr"] += res.get("cost_inr", 0.0)
            else:
                job.progress["failed"] += 1
        job.progress["cost_inr"] = round(job.progress["cost_inr"], 4)
        return job.progress

    j = submit(name="retry_failed_tags", target=_work, is_async=False)
    return {"job_id": j.id, "status": j.status}


# ----------------------- Path-fix utility --------------------------------

@router.post("/normalize-paths")
def normalize_paths(db: Session = Depends(get_db)):
    """One-time migration: rewrite Asset.storage_path from absolute (Windows
    or otherwise) to relative-against-vault. Idempotent."""
    updated = 0
    for asset in db.query(Asset).all():
        if not asset.storage_path:
            continue
        p = Path(asset.storage_path)
        if not p.is_absolute():
            continue  # already relative
        target_ext = p.suffix or (".mp4" if asset.asset_type == "video" else ".webp")
        asset.storage_path = f"videos/{asset.asset_id}{target_ext}"
        updated += 1
    db.commit()
    return {"updated": updated}
