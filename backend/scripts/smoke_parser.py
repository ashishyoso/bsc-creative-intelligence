"""Quick smoke test: parse the real Hawky XLSX and report normalization correctness."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.ingest.parser import detect_roas_precision_issue, parse_hawky_xlsx  # noqa: E402


def main():
    xlsx = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(
        "G:/My Drive/Claude Records/BSC Content Intelligence/Hawky data/Bombay_Shaving_Company_Dashboard_13-05-2026.xlsx"
    )
    rows = parse_hawky_xlsx(xlsx, limit=100)
    print(f"Parsed {len(rows)} rows from {xlsx.name}")
    multi = [r for r in rows if len(r.ad_ids) > 1]
    print(f"Multi-Ad-ID rows: {len(multi)} (max ids in a row: {max((len(r.ad_ids) for r in rows), default=0)})")

    images = [r for r in rows if r.cdn_url and ("/images/" in r.cdn_url or r.cdn_url.endswith(".webp"))]
    videos = [r for r in rows if r not in images]
    print(f"Images: {len(images)}  Videos: {len(videos)}")

    print(f"Unique CDN URLs: {len({r.cdn_url for r in rows})}")
    print(f"Total unique Ad IDs: {len({a for r in rows for a in r.ad_ids})}")

    # check normalization
    sample = rows[0]
    print("\nFirst row sample:")
    print(f"  cdn_url     : {sample.cdn_url[:80]}...")
    print(f"  ad_ids      : {sample.ad_ids[:3]}... ({len(sample.ad_ids)} total)")
    print(f"  primary_ad  : {sample.primary_ad_id} | {sample.primary_ad_name}")
    print(f"  spend       : {sample.spend}")
    print(f"  roas        : {sample.roas}  (int-flag: {sample.raw_roas_was_integer})")
    print(f"  hook_rate   : {sample.hook_rate}  (decimal, not %)")
    print(f"  hold_rate   : {sample.hold_rate}")
    print(f"  ctr         : {sample.ctr}")

    audit = detect_roas_precision_issue(rows)
    print(f"\nROAS precision audit: {audit}")


if __name__ == "__main__":
    main()
