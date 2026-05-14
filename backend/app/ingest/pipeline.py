"""End-to-end ingest pipeline: parse Hawky → download → verify → write DB.

Idempotent on re-runs: dedup by file hash, ad_refs deduped on (ad_id, asset_id).
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from pathlib import Path

from sqlalchemy.orm import Session

from app.config import settings
from app.db.models import (
    AdReference,
    Asset,
    AuditEvent,
    AutoTag,
    Ingest,
    MappingStatus,
    PerformanceRow,
    TagStatus,
)
from app.db.session import SessionLocal
from app.ingest.downloader import (
    DownloadResult,
    determine_mapping_status,
    download_many,
    ffprobe,
)
from app.ingest.parser import HawkyRow, detect_roas_precision_issue, parse_hawky_xlsx

log = logging.getLogger(__name__)


def _classify_asset_type(cdn_url: str, mime: str | None) -> str:
    if mime and mime.startswith("image/"):
        return "image"
    if "/images/" in cdn_url.lower() or cdn_url.lower().endswith((".webp", ".png", ".jpg", ".jpeg", ".gif")):
        return "image"
    return "video"


async def ingest_xlsx(
    xlsx_path: Path,
    *,
    month_tag: str,
    limit: int | None = None,
    progress_cb=None,
) -> dict:
    """Run the full ingest pipeline. Returns a summary dict."""
    limit = limit if limit is not None else settings.max_ingest_rows

    rows = parse_hawky_xlsx(xlsx_path, limit=limit)
    log.info("Parsed %d Hawky rows from %s", len(rows), xlsx_path.name)

    if not rows:
        return {"status": "no_rows", "rows": 0}

    roas_audit = detect_roas_precision_issue(rows)

    unique_urls = list({r.cdn_url for r in rows if r.cdn_url})

    def _dl_progress(idx, done, result):
        if progress_cb:
            progress_cb({"phase": "download", "done": done, "total": len(unique_urls)})

    download_results = await download_many(unique_urls, progress_cb=_dl_progress)
    by_url: dict[str, DownloadResult] = {d.cdn_url: d for d in download_results}

    # ffprobe each unique downloaded file once
    probe_by_path: dict[Path, dict] = {}
    for dr in download_results:
        if dr.success and dr.storage_path and dr.storage_path not in probe_by_path:
            # ffprobe works on still images too (.webp/.jpg/.png) — gives us width/height
            probe_by_path[dr.storage_path] = ffprobe(dr.storage_path).__dict__

    session: Session = SessionLocal()
    summary = {
        "month_tag": month_tag,
        "rows_parsed": len(rows),
        "unique_urls": len(unique_urls),
        "downloaded": sum(1 for d in download_results if d.success),
        "download_failed": sum(1 for d in download_results if not d.success),
        "assets_verified": 0,
        "assets_mapping_suspect": 0,
        "assets_download_failed": 0,
        "ad_refs_created": 0,
        "performance_rows_created": 0,
        "roas_precision_audit": roas_audit,
        "ingest_id": None,
    }

    try:
        ingest = Ingest(
            source_filename=xlsx_path.name,
            month_tag=month_tag,
            row_count=len(rows),
        )
        session.add(ingest)
        session.flush()
        summary["ingest_id"] = ingest.id

        for r in rows:
            if not r.cdn_url:
                continue
            dr = by_url.get(r.cdn_url)
            if not dr:
                continue

            if not dr.success or not dr.storage_path or not dr.asset_id:
                asset = session.get(Asset, dr.asset_id) if dr.asset_id else None
                if asset is None:
                    asset = Asset(
                        asset_id=f"FAIL_{abs(hash(r.cdn_url))}",
                        file_hash=f"FAIL_{abs(hash(r.cdn_url))}",
                        storage_path="",
                        mapping_key=r.cdn_url,
                        asset_type="video",
                        mime_type=None,
                        declared_duration_seconds=None,
                        mapping_status=MappingStatus.DOWNLOAD_FAILED.value,
                        mapping_resolution_note=dr.error,
                        download_status="failed",
                        download_error=dr.error,
                    )
                    session.add(asset)
                summary["assets_download_failed"] += 1
                continue

            probe = probe_by_path.get(dr.storage_path, {})
            asset_type = _classify_asset_type(dr.cdn_url, dr.mime_type)
            actual_duration = probe.get("duration_seconds")

            asset = session.get(Asset, dr.asset_id)
            if asset is None:
                # Hawky export in this format has no Duration column, so declared=None.
                # The verifier treats that as "nothing to compare; trust ffprobe."
                mapping_status, note = determine_mapping_status(
                    asset_type=asset_type,
                    declared_duration_seconds=None,
                    actual_duration_seconds=actual_duration,
                )
                asset = Asset(
                    asset_id=dr.asset_id,
                    file_hash=dr.file_hash,
                    storage_path=str(dr.storage_path),
                    mapping_key=r.cdn_url,
                    asset_type=asset_type,
                    mime_type=dr.mime_type,
                    declared_duration_seconds=None,
                    actual_duration_seconds=actual_duration,
                    actual_width=probe.get("width"),
                    actual_height=probe.get("height"),
                    video_codec=probe.get("video_codec"),
                    audio_codec=probe.get("audio_codec"),
                    size_bytes=dr.size_bytes,
                    mapping_status=mapping_status,
                    mapping_resolution_note=note,
                    download_status="downloaded",
                )
                session.add(asset)
            else:
                asset.last_seen_at = datetime.utcnow()

            if asset.mapping_status == MappingStatus.VERIFIED.value:
                summary["assets_verified"] += 1
            elif asset.mapping_status == MappingStatus.MAPPING_SUSPECT.value:
                summary["assets_mapping_suspect"] += 1

            # AdReferences: one per parsed Ad ID
            for ad_id, ad_name in zip(
                r.ad_ids or [None],
                (r.ad_names + [None] * len(r.ad_ids))[: max(len(r.ad_ids), 1)],
            ):
                if not ad_id:
                    continue
                exists = (
                    session.query(AdReference)
                    .filter_by(ad_id=ad_id, asset_id=asset.asset_id)
                    .first()
                )
                if exists is None:
                    session.add(
                        AdReference(
                            ad_id=ad_id,
                            asset_id=asset.asset_id,
                            ad_name=ad_name,
                            hawky_sku_implied=_infer_hawky_sku(ad_name or r.primary_ad_name),
                        )
                    )
                    summary["ad_refs_created"] += 1

            # PerformanceRow per (asset_id, ad_id, month_tag) — idempotent.
            # Re-running the same XLSX for the same month UPDATES the existing row
            # instead of inserting a duplicate (which would double-count spend etc).
            existing_perf = (
                session.query(PerformanceRow)
                .filter_by(asset_id=asset.asset_id, ad_id=r.primary_ad_id, month_tag=month_tag)
                .first()
            )
            if existing_perf is None:
                session.add(
                    PerformanceRow(
                        asset_id=asset.asset_id,
                        ad_id=r.primary_ad_id,
                        ingest_id=ingest.id,
                        month_tag=month_tag,
                        spend=r.spend,
                        impressions=r.impressions,
                        hook_rate=r.hook_rate,
                        hold_rate=r.hold_rate,
                        ctr=r.ctr,
                        roas=r.roas,
                        clicks=r.clicks,
                        atc=r.atc,
                        all_clicks=r.all_clicks,
                        cpc=r.cpc,
                        cpm=r.cpm,
                        roas_was_integer=r.raw_roas_was_integer,
                    )
                )
                summary["performance_rows_created"] += 1
            else:
                existing_perf.ingest_id = ingest.id
                existing_perf.spend = r.spend
                existing_perf.impressions = r.impressions
                existing_perf.hook_rate = r.hook_rate
                existing_perf.hold_rate = r.hold_rate
                existing_perf.ctr = r.ctr
                existing_perf.roas = r.roas
                existing_perf.clicks = r.clicks
                existing_perf.atc = r.atc
                existing_perf.all_clicks = r.all_clicks
                existing_perf.cpc = r.cpc
                existing_perf.cpm = r.cpm
                existing_perf.roas_was_integer = r.raw_roas_was_integer
                summary.setdefault("performance_rows_updated", 0)
                summary["performance_rows_updated"] += 1

        session.add(
            AuditEvent(
                action_type="ingest_completed",
                target_entity="ingest",
                target_id=str(ingest.id),
                payload=str(summary),
            )
        )
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()

    return summary


def _infer_hawky_sku(ad_name: str | None) -> str | None:
    if not ad_name:
        return None
    s = ad_name.lower()
    if "fbt se" in s:
        return "FBT SE"
    if "fbt" in s:
        return "FBT"
    if "3@999" in s or "3 @ 999" in s or "3@ 999" in s:
        return "3@999"
    if "18hr" in s or "18 hr" in s:
        return "18hr"
    if "legend" in s:
        return "Legend 365"
    if "blo" in s:
        return "Blo Trimmer"
    if "bombae" in s:
        return "Bombae"
    if "fragrance" in s or "perfume" in s or "cologne" in s:
        return "Fragrance"
    return None


def ingest_xlsx_sync(*args, **kwargs):
    return asyncio.run(ingest_xlsx(*args, **kwargs))
