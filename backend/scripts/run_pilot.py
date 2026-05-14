"""CLI: run the 100-video pilot end to end.

Usage:
    python scripts/run_pilot.py --xlsx "G:/My Drive/.../Bombay_Shaving_Company_Dashboard_13-05-2026.xlsx" \
                                --month "Month 1 - May 2026" --limit 100
"""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings  # noqa: E402
from app.db.session import Base, engine  # noqa: E402
from app.ingest.pipeline import ingest_xlsx  # noqa: E402
from app.tagging.pipeline import tag_all_pending  # noqa: E402


logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--xlsx", required=True)
    parser.add_argument("--month", required=True)
    parser.add_argument("--limit", type=int, default=100)
    parser.add_argument("--skip-tag", action="store_true", help="Only ingest; don't auto-tag")
    args = parser.parse_args()

    Base.metadata.create_all(bind=engine)

    xlsx = Path(args.xlsx)
    print(f"Ingesting {xlsx.name} (limit={args.limit}, month={args.month})")
    print(f"Vault: {settings.vault_root}")
    print(f"DB:    {settings.db_path}")

    summary = asyncio.run(ingest_xlsx(xlsx, month_tag=args.month, limit=args.limit))
    print("\nINGEST SUMMARY")
    print(json.dumps(summary, indent=2, default=str))

    if args.skip_tag:
        return

    if not settings.anthropic_api_key:
        print("\nANTHROPIC_API_KEY not set — skipping auto-tagging.")
        return
    if not settings.openai_api_key:
        print("\nNote: OPENAI_API_KEY not set — Whisper transcription will be skipped (videos still tagged from frames).")

    print("\nAuto-tagging eligible assets...")
    tag_summary = tag_all_pending()
    print("\nTAG SUMMARY")
    print(json.dumps(tag_summary, indent=2, default=str))


if __name__ == "__main__":
    main()
