"""
Cron registration for all 5 source workers (US-2.x) + cache eviction.

Uses APScheduler in BackgroundScheduler mode. Started by main.py once
INSPIRATION_DATABASE_URL is configured. Times in IST (Asia/Kolkata).
"""
from __future__ import annotations

import logging

log = logging.getLogger("inspiration.scheduler")

_scheduler = None


def start() -> None:
    """Idempotent — safe to call from main.py."""
    global _scheduler
    if _scheduler is not None:
        return
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        from apscheduler.triggers.cron import CronTrigger
        from pytz import timezone as tz
    except ImportError:
        log.warning("APScheduler/pytz not installed — Inspiration cron disabled")
        return

    IST = tz("Asia/Kolkata")
    sch = BackgroundScheduler(timezone=IST)

    from app.inspiration.ingest import (
        brand_sites,
        cache,
        meta_ad_library,
        meta_marketing,
        tiktok,
        youtube,
    )
    from app.inspiration.sync.notion import flush_pending

    sch.add_job(meta_ad_library.run, CronTrigger(hour=3, minute=0), id="meta_ad_library_03_ist")
    sch.add_job(meta_marketing.run, CronTrigger(hour=4, minute=0), id="meta_marketing_04_ist")
    sch.add_job(youtube.run, CronTrigger(hour=5, minute=0), id="youtube_05_ist")
    sch.add_job(tiktok.run, CronTrigger(day_of_week="mon", hour=6, minute=0), id="tiktok_weekly_06_ist")
    sch.add_job(brand_sites.run, CronTrigger(day_of_week="tue", hour=6, minute=0), id="brand_sites_weekly_06_ist")
    # Cache eviction once a week
    sch.add_job(cache.evict_rejected_older_than, CronTrigger(day_of_week="sun", hour=2, minute=0), id="cache_evict")
    # Notion sync retry every 10 minutes
    sch.add_job(flush_pending, CronTrigger(minute="*/10"), id="notion_retry")

    sch.start()
    _scheduler = sch
    log.info("Inspiration scheduler started (IST timezone)")


def shutdown() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
