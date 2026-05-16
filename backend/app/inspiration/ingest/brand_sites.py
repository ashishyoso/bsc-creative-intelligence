"""
US-2.5 — Brand site Playwright scraper (weekly Tue 06:00 IST).

For each watchlisted brand_site entry, visit the configured URL and harvest
<video> elements + common embed iframes. New video_src_urls are upserted as
Video rows; existing URLs are skipped (hash on video_src_url).
"""
from __future__ import annotations

import hashlib
import logging
from urllib.parse import urljoin

from sqlalchemy.orm import Session

from app.inspiration.db import get_db
from app.inspiration.ingest.common import record_pull
from app.inspiration.models import Video, WatchlistEntry
from app.inspiration.util import ulid

log = logging.getLogger("inspiration.ingest.brand_sites")


def _hash_url(url: str) -> str:
    return hashlib.sha256(url.encode("utf-8")).hexdigest()[:16]


def _harvest_page(url: str) -> list[str]:
    """Return list of video src URLs found on a page. Uses Playwright in
    the runtime; here we keep the surface clean — caller-injected for tests."""
    from playwright.sync_api import sync_playwright

    found: list[str] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(user_agent="Mozilla/5.0 BSC-Inspiration-Bot/0.1")
        page = context.new_page()
        page.goto(url, wait_until="networkidle", timeout=30_000)

        # Native <video> sources
        sources = page.eval_on_selector_all(
            "video source, video",
            "(els) => els.map(e => e.src || (e.querySelector && e.querySelector('source') && e.querySelector('source').src)).filter(Boolean)",
        )
        for s in sources:
            found.append(urljoin(url, s))

        # Embeds: YouTube / Vimeo / Wistia iframes
        iframes = page.eval_on_selector_all(
            "iframe[src*='youtube'], iframe[src*='vimeo'], iframe[src*='wistia']",
            "(els) => els.map(e => e.src)",
        )
        for s in iframes:
            found.append(s)

        browser.close()
    return list(dict.fromkeys(found))  # de-dup, preserve order


def _upsert(db: Session, brand: str, page_url: str, video_src: str) -> bool:
    ext_id = f"brandsite:{_hash_url(video_src)}"
    if db.query(Video).filter(
        Video.source_channel == "brand_site",
        Video.source_external_id == ext_id,
    ).first():
        return False
    v = Video(
        id=ulid(),
        source_channel="brand_site",
        source_external_id=ext_id,
        brand=brand,
        video_url=video_src,
        link_url=page_url,
    )
    db.add(v)
    return True


def run() -> int:
    with record_pull("brand_site") as counter:
        gen = get_db()
        db: Session = next(gen)
        try:
            entries = (
                db.query(WatchlistEntry)
                .filter(
                    WatchlistEntry.source_channel == "brand_site",
                    WatchlistEntry.is_active.is_(True),
                )
                .all()
            )
            for entry in entries:
                if not entry.source_external_id:
                    continue
                try:
                    urls = _harvest_page(entry.source_external_id)
                    for u in urls:
                        if _upsert(db, entry.brand, entry.source_external_id, u):
                            counter["records"] += 1
                    db.commit()
                except Exception as e:
                    log.exception("brand_site: %s failed", entry.brand)
                    counter["errors"] += 1
                    counter["last_error"] = f"{entry.brand}: {e}"
            return counter["records"]
        finally:
            db.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    print("Ingested", run(), "new brand-site videos")
