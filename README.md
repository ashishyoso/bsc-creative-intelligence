# BSC × YOSO Creative Intelligence — 100-video pilot

Internal tool for the YOSO Content Brief Expert. Ingests Hawky monthly exports,
downloads + permanently stores every creative, auto-tags via Claude vision,
joins tags to performance, and surfaces pattern leaderboards.

This is the **pilot slice** of the v0.1 PRD — Module 1 (ingest + vault),
Module 9 US-9.1 (auto-tagging), Module 2 (library browser), Module 3
US-3.1/3.6/3.7 (univariate leaderboards with confidence indicators), Module 7
US-7.5 (ROAS precision audit).

Magic Formula, Brief Generator, fatigue alerts, persona coverage, and the rest
of v1.1 are deliberately out of scope for the pilot.

## Where things live

- **Code**: `C:\bsc-app\` (local NTFS — required, Google Drive can't host node_modules)
- **Vault** (downloaded videos + extracted frames + SQLite DB): `C:\bsc-vault\`
- **Source data** (your Hawky export): wherever you keep it on Google Drive

The Hawky data path is passed in as an argument — there's no coupling to the
Drive location.

## Stack

- **Backend**: Python 3.12, FastAPI, SQLAlchemy + SQLite
- **Frontend**: Next.js 15 (App Router), React 19, TypeScript
- **Pipeline**: ffmpeg/ffprobe, OpenAI Whisper API, Anthropic Claude Sonnet 4.6

## Prereqs

- Python 3.12+, Node 20+, ffmpeg in PATH ✓ (already installed on your machine)
- An Anthropic API key — set `ANTHROPIC_API_KEY` in `backend/.env`
- An OpenAI API key for Whisper — set `OPENAI_API_KEY` in `backend/.env`

## First-time setup

```powershell
cd C:\bsc-app\backend
copy .env.example .env
notepad .env   # set ANTHROPIC_API_KEY and OPENAI_API_KEY, save
```

(Dependencies are already installed if you ran the bootstrap during scaffolding.
Otherwise: `python -m venv .venv` then `.\.venv\Scripts\python.exe -m pip install -r requirements.txt`
in `backend\`, and `npm install` in `frontend\`.)

## Running

Two terminals:

```powershell
# Terminal 1 — backend
cd C:\bsc-app\backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000

# Terminal 2 — frontend
cd C:\bsc-app\frontend
npm run dev
```

Open http://localhost:3000.

## Run the 100-video pilot

Easiest path: open the **Ingest** tab in the UI, click "Ingest + tag (limit=100)".
It will parse the XLSX, download all 100 unique videos, ffprobe them, write the
DB, then auto-tag every eligible asset. UI shows progress.

Or via CLI:

```powershell
cd C:\bsc-app\backend
.\.venv\Scripts\python.exe scripts/run_pilot.py `
  --xlsx "G:/My Drive/Claude Records/BSC Content Intelligence/Hawky data/Bombay_Shaving_Company_Dashboard_13-05-2026.xlsx" `
  --month "Month 1 - May 2026" --limit 100
```

What happens (verbatim PRD references):

1. **Parse XLSX** (US-1.1, US-1.2): splits multi-Ad-ID rows, normalizes percentages
   to decimals, preserves null vs zero, stores ROAS at source precision and flags
   integer-rounded data (US-7.5).
2. **Download** (US-1.3): concurrent CDN downloads to `C:\bsc-vault\videos\`,
   SHA-256 dedup, retry with exponential backoff.
3. **ffprobe** (US-1.3): captures `actual_duration_seconds`, dimensions, codecs
   as ground truth — Hawky's declared duration is never trusted.
4. **Mapping verification** (US-1.9): video files that don't match declared duration
   land in the Mapping Queue, hard-gating downstream tagging until the Hook
   Architect resolves them.
5. **Rename** (US-1.4): asset_id = first 16 hex chars of SHA-256. The same file
   under different CDN URLs collapses to one record.
6. **Auto-tag** (US-9.1): extracts 6 frames at PRD-specified timestamps (0.5s,
   2s, 3.5s, 50%, 75%, end-1s — all from actual duration), pulls audio at 16kHz
   mono, transcribes via Whisper, sends frames + transcript to Claude Sonnet
   with the BSC/YOSO taxonomy schema. Per-field confidence scores stored.

Expected timing for 100 videos: ~3 min download + ~8 min auto-tag. Total LLM
cost ≈ ₹250–400. Disk usage: ~3–6 GB depending on average duration.

## Scope status vs PRD v0.1

**In the pilot (P0 stories):**

| Module | Stories | Status |
|---|---|---|
| 1. Ingest & Vault | US-1.1 to US-1.9 | done |
| 2. Library Browser | US-2.1 to US-2.5 (grid, hover-play, detail, filter, sort) | done |
| 3. Pattern Intelligence | US-3.1, US-3.2, US-3.3, US-3.6 (leaderboards + confidence + SKU stratify) | done (funnel-stage lens deferred) |
| 7. Quality | US-7.5 (ROAS precision audit) | done |
| 9. Infrastructure | US-9.1 (auto-tagging pipeline) | done |

**Deferred to v1.1:**

- US-1.6 concept clustering (the column exists; clustering algo deferred)
- US-2.6 saved views, US-2.7 multi-select compare, US-2.8 tag drill-down, US-2.9 advanced search, US-2.10 download
- US-3.4 combinatorial mining, US-3.5 anti-patterns, US-3.8 segment compare, US-3.9/3.10 persona coverage
- Module 4 Magic Formula
- Module 5 Brief Generator
- Module 6 Operational hooks
- Module 7 US-7.1 to US-7.4 (review queue, mislabel, 60% rule, brand-first-3s)
- Module 8 Reporting
- Module 10 Hook Library
- Module 11 External intelligence

**Deferred to v2:**

- Module 9 US-9.2/9.3/9.4 (auth, audit, notification prefs), US-9.5 mobile, US-9.6 comment mining
- US-5.4 predicted-vs-actual track record
- Module 8 client-facing & quarterly reports

## Cost notes

- Frame extraction: local, free.
- Whisper API: ~$0.006/min ≈ ₹0.50 per 60-second video.
- Claude Sonnet 4.6 vision: ~₹2–3 per asset.
- Full 2,800 videos: ≈ ₹6,000–10,000 one-time. To halve: set
  `VISION_MODEL=claude-haiku-4-5-20251001` in `.env`.

## Architecture notes

- **Vault outside Google Drive** — videos and SQLite live on `C:\bsc-vault\`. Drive sync would choke on 100GB of mp4.
- **SHA-256 as asset_id** — defeats CDN re-encoding and Hawky relabeling. A re-ingest of the same file appears as the same asset_id and just adds a new PerformanceRow.
- **Mapping gate on tagging** — `tag_asset()` refuses to run on MAPPING_SUSPECT or DOWNLOAD_FAILED. This is the hard requirement from US-1.9 + US-9.1; without it, V5-style 6.9s-vs-22s mismatches silently corrupt tags.
- **Frame timestamps from ffprobe ground truth** — never from Hawky's declared duration. Hardcoded into `frames.frame_schedule()`.

## What's next (roadmap)

In order of value to the brief expert:

1. **Concept clustering (US-1.6)** — pHash + hook-frame similarity to surface V2/V3 of the same concept.
2. **Combinatorial pattern mining (US-3.4)** — pairs/triples of tags ranked by metric. Makes the leaderboard 10× more useful.
3. **Magic Formula (Module 4)** — the actual brief-recommendation engine. Needs concept_id + combinatorial mining as inputs.
4. **Hook Library (Module 10)** — extract verbal + on-screen hooks from top performers, never lose a great hook to brief docs again.
5. **Fatigue alerts + kill/scale (US-6.1/6.2)** — once you have 2+ months of data ingested.
