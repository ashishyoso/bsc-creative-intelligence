"""Extract 16kHz mono WAV and transcribe with OpenAI Whisper.

US-9.1: same physical file as verified in US-1.3 (path passed in).
Empty transcript = music-only video.
"""
from __future__ import annotations

import logging
import subprocess
from dataclasses import dataclass
from pathlib import Path

from app.config import settings

log = logging.getLogger(__name__)


@dataclass
class TranscriptionResult:
    text: str
    language: str | None
    duration_seconds: float | None
    cost_inr: float
    error: str | None = None


def extract_audio_wav(video_path: Path, *, out_path: Path) -> bool:
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(video_path),
        "-ac",
        "1",
        "-ar",
        "16000",
        "-vn",
        str(out_path),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120, check=False)
    if proc.returncode != 0:
        log.warning("ffmpeg audio extract failed: %s", proc.stderr[:200])
        return False
    return out_path.exists() and out_path.stat().st_size > 0


def transcribe_whisper(audio_path: Path) -> TranscriptionResult:
    """Call OpenAI Whisper API. Empty audio → empty result, not error."""
    if not settings.openai_api_key:
        return TranscriptionResult("", None, None, 0.0, error="OPENAI_API_KEY not set")

    if not audio_path.exists() or audio_path.stat().st_size < 1000:
        return TranscriptionResult("", None, None, 0.0)

    try:
        from openai import OpenAI

        client = OpenAI(api_key=settings.openai_api_key)
        with audio_path.open("rb") as f:
            resp = client.audio.transcriptions.create(
                model=settings.whisper_model,
                file=f,
                response_format="verbose_json",
            )
        text = (resp.text or "").strip()
        duration = getattr(resp, "duration", None)
        language = getattr(resp, "language", None)

        # whisper-1 pricing: $0.006/minute. Convert to INR ~83.
        cost_inr = (duration or 0) / 60.0 * 0.006 * 83.0

        return TranscriptionResult(
            text=text,
            language=language,
            duration_seconds=duration,
            cost_inr=round(cost_inr, 4),
        )
    except Exception as e:
        log.warning("Whisper transcription failed: %s", e)
        return TranscriptionResult("", None, None, 0.0, error=str(e))
