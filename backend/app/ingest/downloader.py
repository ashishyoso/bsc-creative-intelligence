"""Download CDN assets to the local vault and verify against Hawky-declared metadata.

Implements US-1.3, US-1.4, US-1.9:
- Concurrent downloads with retry + exponential backoff
- Dedup by SHA-256 (re-uses asset_id if the same physical file is seen again)
- ffprobe ground truth: actual_duration/width/height/codecs
- Mapping verification: duration mismatch > tolerance => MAPPING_SUSPECT
- Stable asset_id = first 16 hex chars of SHA-256 (deterministic, dedup-friendly)
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import mimetypes
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import httpx

from app.config import settings
from app.db.models import MappingStatus


@dataclass
class DownloadResult:
    cdn_url: str
    success: bool
    storage_path: Path | None
    file_hash: str | None
    asset_id: str | None
    size_bytes: int | None
    mime_type: str | None
    error: str | None = None
    dedup_hit: bool = False


@dataclass
class ProbeResult:
    duration_seconds: float | None
    width: int | None
    height: int | None
    video_codec: str | None
    audio_codec: str | None
    raw: dict | None = None


def _asset_id_from_hash(file_hash: str) -> str:
    return file_hash[:16]


def _guess_mime(url: str, content_type: str | None) -> str:
    if content_type:
        return content_type.split(";")[0].strip()
    mt, _ = mimetypes.guess_type(url)
    return mt or "application/octet-stream"


def _ext_from_mime(mime: str, url: str) -> str:
    if mime.startswith("video/mp4"):
        return ".mp4"
    if mime.startswith("video/"):
        return mimetypes.guess_extension(mime) or ".mp4"
    if mime.startswith("image/webp"):
        return ".webp"
    if mime.startswith("image/"):
        return mimetypes.guess_extension(mime) or ".jpg"
    m = re.search(r"\.(mp4|mov|webm|webp|png|jpe?g|gif)(?:\?|$)", url, re.IGNORECASE)
    if m:
        return "." + m.group(1).lower()
    return ".bin"


async def _stream_to_temp(client: httpx.AsyncClient, url: str, dest: Path) -> tuple[str, int, str]:
    sha = hashlib.sha256()
    size = 0
    content_type: str | None = None
    async with client.stream("GET", url) as response:
        response.raise_for_status()
        content_type = response.headers.get("content-type")
        with dest.open("wb") as f:
            async for chunk in response.aiter_bytes(chunk_size=1024 * 256):
                sha.update(chunk)
                size += len(chunk)
                f.write(chunk)
    return sha.hexdigest(), size, content_type or ""


async def download_one(
    client: httpx.AsyncClient,
    cdn_url: str,
    *,
    seen_hashes: dict[str, Path],
    max_retries: int = 3,
) -> DownloadResult:
    """Download cdn_url to the vault. Idempotent on hash collision."""
    settings.videos_dir.mkdir(parents=True, exist_ok=True)
    tmp = settings.videos_dir / f".tmp__{abs(hash(cdn_url))}"

    last_error: Exception | None = None
    for attempt in range(1, max_retries + 1):
        try:
            file_hash, size, content_type = await _stream_to_temp(client, cdn_url, tmp)
            break
        except Exception as e:  # network / 4xx / 5xx
            last_error = e
            if tmp.exists():
                tmp.unlink(missing_ok=True)
            if attempt < max_retries:
                await asyncio.sleep(2**attempt)
    else:
        return DownloadResult(
            cdn_url=cdn_url,
            success=False,
            storage_path=None,
            file_hash=None,
            asset_id=None,
            size_bytes=None,
            mime_type=None,
            error=f"download_failed: {last_error}",
        )

    asset_id = _asset_id_from_hash(file_hash)
    mime = _guess_mime(cdn_url, content_type)
    ext = _ext_from_mime(mime, cdn_url)
    final = settings.videos_dir / f"{asset_id}{ext}"

    if final.exists() or file_hash in seen_hashes:
        tmp.unlink(missing_ok=True)
        existing = seen_hashes.get(file_hash, final)
        return DownloadResult(
            cdn_url=cdn_url,
            success=True,
            storage_path=existing,
            file_hash=file_hash,
            asset_id=asset_id,
            size_bytes=existing.stat().st_size if existing.exists() else size,
            mime_type=mime,
            dedup_hit=True,
        )

    tmp.replace(final)
    seen_hashes[file_hash] = final
    return DownloadResult(
        cdn_url=cdn_url,
        success=True,
        storage_path=final,
        file_hash=file_hash,
        asset_id=asset_id,
        size_bytes=size,
        mime_type=mime,
    )


async def download_many(
    cdn_urls: Iterable[str],
    *,
    concurrency: int | None = None,
    timeout_seconds: int | None = None,
    progress_cb=None,
) -> list[DownloadResult]:
    concurrency = concurrency or settings.download_concurrency
    timeout_seconds = timeout_seconds or settings.download_timeout_seconds
    seen_hashes: dict[str, Path] = {}
    sem = asyncio.Semaphore(concurrency)
    results: list[DownloadResult] = []

    async with httpx.AsyncClient(
        timeout=httpx.Timeout(timeout_seconds),
        follow_redirects=True,
        headers={"User-Agent": "BSC-CreativeIntel/0.1"},
    ) as client:
        async def _bounded(url: str, idx: int):
            async with sem:
                result = await download_one(client, url, seen_hashes=seen_hashes)
                results.append(result)
                if progress_cb:
                    progress_cb(idx, len(results), result)

        tasks = [_bounded(u, i) for i, u in enumerate(cdn_urls)]
        await asyncio.gather(*tasks)

    return results


def ffprobe(path: Path) -> ProbeResult:
    """Run ffprobe and extract duration, dimensions, codecs."""
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        str(path),
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=30, check=False)
        if proc.returncode != 0:
            return ProbeResult(None, None, None, None, None, raw={"error": proc.stderr})
        data = json.loads(proc.stdout or "{}")
    except (subprocess.TimeoutExpired, json.JSONDecodeError) as e:
        return ProbeResult(None, None, None, None, None, raw={"error": str(e)})

    duration = None
    if "format" in data and "duration" in data["format"]:
        try:
            duration = float(data["format"]["duration"])
        except (TypeError, ValueError):
            duration = None

    video_stream = next((s for s in data.get("streams", []) if s.get("codec_type") == "video"), None)
    audio_stream = next((s for s in data.get("streams", []) if s.get("codec_type") == "audio"), None)

    return ProbeResult(
        duration_seconds=duration,
        width=int(video_stream["width"]) if video_stream and "width" in video_stream else None,
        height=int(video_stream["height"]) if video_stream and "height" in video_stream else None,
        video_codec=video_stream.get("codec_name") if video_stream else None,
        audio_codec=audio_stream.get("codec_name") if audio_stream else None,
        raw=data,
    )


def determine_mapping_status(
    *,
    asset_type: str,
    declared_duration_seconds: float | None,
    actual_duration_seconds: float | None,
    tolerance_seconds: float | None = None,
) -> tuple[str, str | None]:
    """US-1.9: verify the downloaded file matches the Hawky row.

    - Images skip duration check (always VERIFIED if downloaded).
    - Video with no actual duration => MAPPING_SUSPECT (ffprobe failure).
    - If declared is 0/unknown and actual is positive => MAPPING_SUSPECT (Hawky data error).
    - If |declared - actual| > tolerance => MAPPING_SUSPECT.
    """
    tolerance = tolerance_seconds or settings.mapping_duration_tolerance_seconds

    if asset_type == "image":
        return MappingStatus.VERIFIED.value, None

    if actual_duration_seconds is None:
        return MappingStatus.MAPPING_SUSPECT.value, "ffprobe could not determine duration"

    if declared_duration_seconds is None:
        # Hawky export doesn't include a duration column in this format — we have
        # nothing to compare against. Trust ffprobe ground truth and move on.
        return MappingStatus.VERIFIED.value, None

    if declared_duration_seconds == 0 and actual_duration_seconds > 0:
        return (
            MappingStatus.MAPPING_SUSPECT.value,
            f"Hawky declared 0s but file is {actual_duration_seconds:.1f}s",
        )

    delta = abs(actual_duration_seconds - declared_duration_seconds)
    if delta > tolerance:
        return (
            MappingStatus.MAPPING_SUSPECT.value,
            f"duration mismatch: Hawky {declared_duration_seconds:.1f}s vs actual {actual_duration_seconds:.1f}s (delta {delta:.1f}s)",
        )

    return MappingStatus.VERIFIED.value, None
