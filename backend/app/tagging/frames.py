"""Extract frames at strategic timestamps using ffmpeg.

US-9.1: timestamps computed from actual_duration (NEVER Hawky's declared).
Schedule: 0.5s, 2s, 3.5s, 0.5*duration, 0.75*duration, duration-1s.
"""
from __future__ import annotations

import base64
import logging
import subprocess
from dataclasses import dataclass
from pathlib import Path

from app.config import settings

log = logging.getLogger(__name__)


@dataclass
class ExtractedFrame:
    timestamp: float
    label: str
    path: Path

    def as_base64(self) -> str:
        return base64.standard_b64encode(self.path.read_bytes()).decode("ascii")


def frame_schedule(actual_duration: float) -> list[tuple[float, str]]:
    """Return [(timestamp_seconds, label)] for the asset's actual duration."""
    if actual_duration <= 0:
        return [(0.0, "frame_0")]

    # PRD-prescribed: 0.5s, 2s, 3.5s, 50%, 75%, duration-1s
    candidates = [
        (0.5, "hook_0_5s"),
        (2.0, "hook_2s"),
        (3.5, "hook_3_5s"),
        (round(actual_duration * 0.5, 2), "mid_50pct"),
        (round(actual_duration * 0.75, 2), "late_75pct"),
        (max(0.0, round(actual_duration - 1.0, 2)), "end_minus_1s"),
    ]
    # Dedup while preserving order; drop frames beyond duration
    seen: set[float] = set()
    out: list[tuple[float, str]] = []
    for ts, label in candidates:
        if ts > actual_duration:
            ts = max(0.0, actual_duration - 0.1)
        if ts in seen:
            continue
        seen.add(ts)
        out.append((ts, label))
    return out


def extract_frames(
    video_path: Path,
    *,
    asset_id: str,
    actual_duration: float,
    out_dir: Path | None = None,
    max_height: int = 720,
) -> list[ExtractedFrame]:
    out_dir = out_dir or (settings.frames_dir / asset_id)
    out_dir.mkdir(parents=True, exist_ok=True)

    frames: list[ExtractedFrame] = []
    for ts, label in frame_schedule(actual_duration):
        frame_path = out_dir / f"{label}.jpg"
        cmd = [
            "ffmpeg",
            "-y",
            "-ss",
            f"{ts:.3f}",
            "-i",
            str(video_path),
            "-frames:v",
            "1",
            "-vf",
            f"scale=-2:{max_height}",
            "-q:v",
            "4",
            str(frame_path),
        ]
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=30, check=False)
            if proc.returncode != 0 or not frame_path.exists():
                log.warning("ffmpeg frame extract failed at %ss for %s: %s", ts, asset_id, proc.stderr[:200])
                continue
            frames.append(ExtractedFrame(timestamp=ts, label=label, path=frame_path))
        except subprocess.TimeoutExpired:
            log.warning("ffmpeg timeout at %ss for %s", ts, asset_id)
            continue

    return frames


def extract_single_image(image_path: Path, *, asset_id: str, out_dir: Path | None = None, max_height: int = 720) -> list[ExtractedFrame]:
    """For static image assets — just copy/resize once."""
    out_dir = out_dir or (settings.frames_dir / asset_id)
    out_dir.mkdir(parents=True, exist_ok=True)
    frame_path = out_dir / "image.jpg"
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(image_path),
        "-vf",
        f"scale=-2:{max_height}",
        "-q:v",
        "4",
        str(frame_path),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=30, check=False)
    if proc.returncode != 0 or not frame_path.exists():
        log.warning("ffmpeg image convert failed for %s: %s", asset_id, proc.stderr[:200])
        return []
    return [ExtractedFrame(timestamp=0.0, label="image", path=frame_path)]
