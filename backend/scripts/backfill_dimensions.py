"""Backfill actual_width/actual_height for assets that were ingested before
the pipeline started probing images.

Idempotent. Run any time. Affects images and any videos missing dimensions.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db.models import Asset  # noqa: E402
from app.db.session import SessionLocal  # noqa: E402
from app.ingest.downloader import ffprobe  # noqa: E402


def main():
    session = SessionLocal()
    try:
        missing = (
            session.query(Asset)
            .filter((Asset.actual_width.is_(None)) | (Asset.actual_height.is_(None)))
            .filter(Asset.download_status == "downloaded")
            .all()
        )
        print(f"Found {len(missing)} assets missing dimensions")
        updated = 0
        for asset in missing:
            if not asset.storage_path:
                continue
            path = Path(asset.storage_path)
            if not path.exists():
                continue
            probe = ffprobe(path)
            changed = False
            if probe.width and probe.width != asset.actual_width:
                asset.actual_width = probe.width
                changed = True
            if probe.height and probe.height != asset.actual_height:
                asset.actual_height = probe.height
                changed = True
            if changed:
                updated += 1
                if updated % 20 == 0:
                    print(f"  {updated} updated...")
        session.commit()
        print(f"Done. {updated} assets updated.")
    finally:
        session.close()


if __name__ == "__main__":
    main()
