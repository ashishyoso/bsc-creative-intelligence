from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.models import Asset, AutoTag, Ingest, MappingStatus
from app.db.session import get_db
from app.ingest.pipeline import ingest_xlsx
from app.jobs import get_job, list_jobs, submit
from app.tagging.pipeline import ALLOWED_MAPPING_STATUSES, tag_all_pending

router = APIRouter(prefix="/ingest", tags=["ingest"])


class IngestRequest(BaseModel):
    xlsx_path: str
    month_tag: str
    limit: int | None = None
    auto_tag: bool = True


@router.post("/run")
def run_ingest(req: IngestRequest):
    """Kick off ingest (and optionally auto-tag) as a background job.

    Returns immediately with a job_id. Poll /ingest/jobs/{job_id} for progress.
    """
    path = Path(req.xlsx_path)
    if not path.exists():
        raise HTTPException(404, f"xlsx_not_found: {path}")

    async def _work(job):
        # Phase 1 — ingest
        job.phase = "ingesting"

        def _progress_cb(payload):
            job.progress.update(payload)

        summary = await ingest_xlsx(
            path,
            month_tag=req.month_tag,
            limit=req.limit,
            progress_cb=_progress_cb,
        )
        job.progress["ingest_summary"] = summary

        if not req.auto_tag:
            return {"ingest": summary, "tagging": None}

        # Phase 2 — auto-tag (sync; offload from the asyncio loop)
        job.phase = "tagging"
        import asyncio as _asyncio

        def _tag_progress(payload):
            job.progress["tagging"] = payload

        tag_summary = await _asyncio.to_thread(tag_all_pending, None, _tag_progress)
        job.progress["tag_summary"] = tag_summary
        return {"ingest": summary, "tagging": tag_summary}

    job = submit(name="ingest_and_tag", target=_work, is_async=True)
    return {"job_id": job.id, "status": job.status}


@router.post("/tag-pending")
def tag_pending(limit: int | None = None):
    """Kick off auto-tagging for pending assets as a background job."""

    def _work(job):
        job.phase = "tagging"

        def _tag_progress(payload):
            job.progress["tagging"] = payload

        summary = tag_all_pending(limit=limit, progress_cb=_tag_progress)
        job.progress["tag_summary"] = summary
        return summary

    job = submit(name="tag_pending", target=_work, is_async=False)
    return {"job_id": job.id, "status": job.status}


@router.get("/jobs")
def list_jobs_endpoint(limit: int = 20):
    return [j.to_dict() for j in list_jobs(limit)]


@router.get("/jobs/{job_id}")
def get_job_endpoint(job_id: str):
    job = get_job(job_id)
    if job is None:
        raise HTTPException(404, "job_not_found")
    return job.to_dict()


@router.get("/tagging-progress")
def tagging_progress(db: Session = Depends(get_db)):
    """DB-backed live view of tagging progress.

    Works regardless of which job is running — queries actual asset/autotag state.
    """
    eligible_total = (
        db.query(Asset)
        .filter(Asset.mapping_status.in_(list(ALLOWED_MAPPING_STATUSES)))
        .filter(Asset.download_status == "downloaded")
        .count()
    )
    tagged = db.query(AutoTag).count()
    cost_sum = db.query(AutoTag).with_entities(AutoTag.tagging_cost_inr).all()
    total_cost = round(sum((c[0] or 0) for c in cost_sum), 2)

    suspect = (
        db.query(Asset)
        .filter(Asset.mapping_status == MappingStatus.MAPPING_SUSPECT.value)
        .count()
    )
    download_failed = (
        db.query(Asset)
        .filter(Asset.mapping_status == MappingStatus.DOWNLOAD_FAILED.value)
        .count()
    )

    pct = round((tagged / eligible_total * 100), 1) if eligible_total > 0 else 0.0

    return {
        "eligible_total": eligible_total,
        "tagged": tagged,
        "remaining": max(eligible_total - tagged, 0),
        "pct_complete": pct,
        "total_cost_inr": total_cost,
        "avg_cost_per_asset_inr": round(total_cost / tagged, 3) if tagged > 0 else None,
        "mapping_suspect": suspect,
        "download_failed": download_failed,
    }


@router.get("/list")
def list_ingests(db: Session = Depends(get_db)):
    return [
        {
            "id": i.id,
            "month_tag": i.month_tag,
            "source_filename": i.source_filename,
            "row_count": i.row_count,
            "created_at": i.created_at.isoformat(),
            "status": i.status,
        }
        for i in db.query(Ingest).order_by(Ingest.created_at.desc()).all()
    ]
