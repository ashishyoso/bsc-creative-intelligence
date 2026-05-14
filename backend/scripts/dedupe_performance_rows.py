"""One-time cleanup: collapse duplicate PerformanceRow entries.

Caused by re-running ingest with the same XLSX before the pipeline became
idempotent on (asset_id, ad_id, month_tag).

Keeps the most recently-created PerformanceRow for each unique key, deletes
the rest. Idempotent — safe to re-run."""
from __future__ import annotations

import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import desc  # noqa: E402

from app.db.models import PerformanceRow  # noqa: E402
from app.db.session import SessionLocal  # noqa: E402


def main():
    session = SessionLocal()
    try:
        rows = session.query(PerformanceRow).order_by(desc(PerformanceRow.id)).all()
        groups: dict[tuple, list[int]] = defaultdict(list)
        for r in rows:
            groups[(r.asset_id, r.ad_id, r.month_tag)].append(r.id)

        total_groups = len(groups)
        dup_groups = sum(1 for v in groups.values() if len(v) > 1)
        to_delete: list[int] = []
        for ids in groups.values():
            if len(ids) > 1:
                # Keep the highest id (most recent insert); delete the rest
                to_delete.extend(sorted(ids)[:-1])

        if not to_delete:
            print(f"No duplicates found. {total_groups} unique performance rows.")
            return

        print(f"Found {dup_groups} groups with duplicates out of {total_groups} unique keys")
        print(f"Will delete {len(to_delete)} duplicate rows")

        session.query(PerformanceRow).filter(PerformanceRow.id.in_(to_delete)).delete(
            synchronize_session=False
        )
        session.commit()

        remaining = session.query(PerformanceRow).count()
        print(f"Done. Deleted {len(to_delete)} duplicates. {remaining} performance rows remain.")
    finally:
        session.close()


if __name__ == "__main__":
    main()
