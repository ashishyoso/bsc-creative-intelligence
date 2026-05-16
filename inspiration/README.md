# Inspiration — BSC Creative Intelligence Tool

Native creative intelligence: automated sourcing of competitor and own video ads from Meta and adjacent platforms, structured human classification into product- and route-specific taxonomies, fed into the BSC brief pipeline.

**Spec:** [`docs/inspiration-build-plan.md`](../docs/inspiration-build-plan.md) · [`BSC_Creative_Intelligence_Tool_User_Stories.pdf`](https://github.com/ashishyoso/bsc-creative-intelligence/) (v1.0, May 2026)

This module is **separate from the existing Hawky-driven pilot** — different schema, different ingest paths, different output. They share only the Next.js frontend shell.

## Layout

```
inspiration/
├── README.md                 # this file
├── schema/
│   └── 001_init.sql          # Supabase Postgres schema (P0 tables)
└── seed/
    ├── fbt_se_routes.json    # 12 FBT SE routes per US-1.2
    └── watchlist.json        # Brand × source watchlist per Appendix B
```

Backend code (FastAPI router + ingest workers) will land under `backend/app/inspiration/` once Supabase is provisioned.
Frontend pages live under `frontend/app/inspiration/` (already stubbed at `/inspiration`).

## Stack (Option C — hybrid)

- **DB:** Supabase Postgres (separate project from existing pilot's SQLite)
- **Storage:** Cloudflare R2 (video cache, US-9.1)
- **Auth:** Supabase Auth via Google Workspace SSO (yoso.media)
- **Ingest workers:** Python, run as cron jobs inside existing FastAPI process
- **Frontend:** Next.js 15 (reuses existing shell)
- **Sync:** Notion API (one-way mirror, US-5.4)

## Provisioning checklist

See [`docs/inspiration-build-plan.md`](../docs/inspiration-build-plan.md) Day 0–2 table. Nothing in this directory runs until:

1. Supabase project created, `001_init.sql` applied
2. R2 bucket provisioned
3. Meta dev identity verification submitted (1–3 day lead)
4. YouTube Data API key issued
5. Notion integration token + workspace permissions granted
6. Google Workspace SSO wired

## Status

| Story group | Status |
|---|---|
| Schema (US-9.1, 9.2 base) | drafted (`schema/001_init.sql`) |
| Admin CRUD (US-1.1, 1.2, 1.3, 1.4) | seed data ready, backend/UI not started |
| Sourcing (US-2.x) | blocked on credentials |
| Queue / Library / Brief gate / Reports | not started |

## Editor onboarding (Week 3)

Editors: Hardik, Aman, Gaurav, Priyanshu, Samyukta. Target: 30–60 video review per editor per 20-min session.
