"""Shared scaffolding for source workers: pull-lifecycle bookkeeping."""
from __future__ import annotations

import logging
import traceback
from contextlib import contextmanager
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.inspiration.db import get_db
from app.inspiration.models import SourcePull
from app.inspiration.util import ulid

log = logging.getLogger("inspiration.ingest")


@contextmanager
def record_pull(source_channel: str):
    """Wrap each source worker so pulls land in source_pulls (US-2.6)
    even when they crash. Per-brand try/except still belongs inside the
    worker (US-2.1 acceptance: 'one brand failure does not abort the
    batch')."""
    gen = get_db()
    db: Session = next(gen)
    pull = SourcePull(
        id=ulid(),
        source_channel=source_channel,
        started_at=datetime.now(timezone.utc),
    )
    db.add(pull)
    db.commit()
    counter = {"records": 0, "errors": 0, "last_error": None}
    try:
        yield counter
        pull.ok = True
    except Exception as e:
        log.exception("source %s pull failed", source_channel)
        counter["errors"] += 1
        counter["last_error"] = f"{type(e).__name__}: {e}"
        pull.ok = False
    finally:
        pull.finished_at = datetime.now(timezone.utc)
        pull.records_pulled = counter["records"]
        pull.error_count = counter["errors"]
        pull.last_error = counter["last_error"]
        db.commit()
        db.close()
