"""Tiny in-memory job tracker for long-running pipeline runs.

Pilot-grade. Single-process only — fine for the local pilot, but if we ever go
multi-worker we'd swap this for Redis/RQ. The frontend polls /ingest/jobs/{id}
to render progress instead of holding a 10-minute HTTP request open."""
from __future__ import annotations

import asyncio
import threading
import traceback
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Callable


@dataclass
class Job:
    id: str
    name: str
    status: str = "pending"  # pending | running | done | failed
    phase: str = ""
    progress: dict[str, Any] = field(default_factory=dict)
    result: Any = None
    error: str | None = None
    created_at: datetime = field(default_factory=datetime.utcnow)
    started_at: datetime | None = None
    finished_at: datetime | None = None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "status": self.status,
            "phase": self.phase,
            "progress": self.progress,
            "result": self.result,
            "error": self.error,
            "created_at": self.created_at.isoformat(),
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "finished_at": self.finished_at.isoformat() if self.finished_at else None,
            "duration_seconds": (
                (self.finished_at - self.started_at).total_seconds()
                if self.started_at and self.finished_at
                else None
            ),
        }


_jobs: dict[str, Job] = {}
_lock = threading.Lock()


def create_job(name: str) -> Job:
    job = Job(id=uuid.uuid4().hex[:12], name=name)
    with _lock:
        _jobs[job.id] = job
    return job


def get_job(job_id: str) -> Job | None:
    with _lock:
        return _jobs.get(job_id)


def list_jobs(limit: int = 20) -> list[Job]:
    with _lock:
        return sorted(_jobs.values(), key=lambda j: j.created_at, reverse=True)[:limit]


def _run_in_thread(job: Job, target: Callable[[Job], Any], *, is_async: bool):
    """Run `target(job)` in a background thread. `target` may update job.progress
    via the passed-in job reference."""
    def runner():
        job.status = "running"
        job.started_at = datetime.utcnow()
        try:
            if is_async:
                result = asyncio.run(target(job))
            else:
                result = target(job)
            job.result = result
            job.status = "done"
        except Exception as e:
            job.error = f"{type(e).__name__}: {e}\n{traceback.format_exc()}"
            job.status = "failed"
        finally:
            job.finished_at = datetime.utcnow()

    t = threading.Thread(target=runner, daemon=True, name=f"job-{job.id}")
    t.start()
    return t


def submit(name: str, target: Callable[[Job], Any], *, is_async: bool = False) -> Job:
    job = create_job(name)
    _run_in_thread(job, target, is_async=is_async)
    return job
