# BSC Creative Intelligence — Phased P0 Build Plan

**Spec:** `BSC_Creative_Intelligence_Tool_User_Stories.pdf` v1.0 (16 May 2026)
**Plan author:** Ashish + Claude (16 May 2026)
**Status:** Active build plan
**Architectural fork:** Option C (greenfield Supabase + R2 backend for the Inspiration tool, frontend reuses existing Next.js shell, ingest workers run inside existing FastAPI process)

---

## Reality check vs existing pilot

The pilot at `C:\bsc-app\` (FastAPI + SQLite + local NTFS vault, Hawky-driven, auto-tagged) and the Inspiration tool are **two different tools sharing a frontend shell.** They overlap on subject matter (BSC creative) but the schema, ingest paths, taxonomy, and output are orthogonal.

| | Existing pilot | Inspiration tool |
|---|---|---|
| Storage | SQLite + NTFS | Supabase Postgres + R2 |
| Ingest | Hawky XLSX, monthly | 5 live APIs, daily/weekly cron |
| Taxonomy | Auto-tagged (format/persona/etc.) | Manual route classification |
| Output | Pattern leaderboards | Reference library feeding briefs |

Inspiration tables live in their own Supabase project, behind their own FastAPI router under `backend/app/inspiration/`.

---

## Day 0–2 — Pre-flight (parallel to Week 1 build)

| Item | Owner | Lead time | Blocks |
|---|---|---|---|
| Meta Developer Platform identity verification | Ashish | **1–3 days** | US-2.1 |
| Meta Business Manager system user token (BSC + Bombae) | Rishav | 1 day | US-2.2 |
| Google Cloud project + YouTube Data API v3 key | Rishav | <1 day | US-2.3 |
| Notion integration token + workspace write access | Rishav | <1 day | US-5.4, US-6.1 |
| Supabase project + Cloudflare R2 bucket | Dev | <1 day | Everything |
| Google Workspace SSO (yoso.media) wired to Supabase auth | Dev | <1 day | US-1.4 |
| FBT SE route definitions imported from `FBTSE_Creative_Brief_Bank_v2.xlsx` | Founder + Diksha | 1 day | US-1.2 |
| Watchlist seed list approved (Appendix B is draft) | Founder | <1 day | US-1.3 |

---

## Week 1 — Foundation

Goal: schema in place, taxonomy seeded, one source ingesting, source health visible.

| Day | Stories | Notes |
|---|---|---|
| 1 | Repo scaffolding, Supabase schema migrations, R2 bucket, env wiring | No story IDs — infra |
| 1–2 | **US-9.1** video caching to R2, **US-9.2** decision retention schema | Schema covers all P0 tables |
| 2 | **US-1.4** Google SSO + role enforcement middleware | 6 roles per spec |
| 3 | **US-1.1** products CRUD | Seed FBT SE = active |
| 3 | **US-1.2** routes CRUD + import 12 FBT SE routes | Versioned; archive-not-delete |
| 4 | **US-1.3** watchlist CRUD + import Appendix B seed | Per-source entries |
| 4 | **US-2.6** source health dashboard (shell) | All amber initially |
| 5 | **US-2.1** Meta Ad Library cron + ingest worker | Daily 03:00 IST |

**End-of-week deliverable:** Editor logs in via SSO, admin can manage taxonomy, Meta Ad Library data flows nightly, health dashboard turns green.

---

## Week 2 — Core workflow + remaining sources

Goal: full swipe loop working against all 5 sources.

| Day | Stories | Notes |
|---|---|---|
| 6 | **US-2.2** Meta Marketing API ingest (BSC + Bombae) | Spend > ₹1k in 90d filter |
| 7 | **US-2.3** YouTube ingest + quota monitoring | <90s filter, 80% quota alert |
| 8 | **US-2.4** TikTok Creative Center scraper | Fragile — feature-flag |
| 8 | **US-2.5** Brand-site Playwright scraper | Feature-flag |
| 9 | **US-3.1–3.4** product selector, queue list, inline player, metadata | J/K nav, spacebar play |
| 10 | **US-3.5** save with mandatory tagging modal | Load-bearing UX |
| 10 | **US-3.6** reject + structured reason | |
| 11 | **US-3.7** escalate → senior queue | |
| 11 | **US-3.8** never re-surface decided videos | Global decisioning |

**End-of-week deliverable:** Editor clears 30–60 videos/session across all 5 sources. Decisions persist.

---

## Week 3 — Library, brief gate, reports, launch

Goal: saved references discoverable + Notion-mirrored, brief gate live, editors trained.

| Day | Stories | Notes |
|---|---|---|
| 12 | **US-4.1–4.6** six P0 filters | Default: 30+ days running, Pending status |
| 13 | **US-5.1** route board view | One per product × route |
| 13 | **US-5.2** reference detail + permalink | `/reference/<ulid>` |
| 14 | **US-5.3** optional shot breakdown (post-save) | Skippable |
| 14 | **US-5.4** Notion one-way sync | Auto-create DB per route on first save |
| 15 | **US-6.1** brief template requires ≥2 references | Non-negotiable per spec |
| 16 | **US-8.1** escalation queue (Senior Reviewer UI) | |
| 16 | **US-7.1** decisions log + CSV export | |
| 17 | **US-7.2** source volume report | <10% save rate flag |
| 17 | **US-7.3** route coverage report | <5 saves flag |
| 18 | Editor training, taxonomy walkthrough, soft launch | |

**End-of-week deliverable:** Editors run daily sessions. No brief advances to "Approved for Production" without 2 refs from the relevant route.

---

## Risks & open items

1. **Meta identity verification slip** → US-2.1 moves to Week 2; ingestion infra still ships Week 1.
2. **TikTok Creative Center fragility** → feature-flag so a break doesn't block Editor launch.
3. **Notion brief gate enforcement mechanism** → webhook from Notion vs in-tool status-change check. Affects Week 3 sequencing.
4. **Editor time allocation** — 20 min/day × 5 editors = 1.7 person-hr/day of review labour. Confirm before launch or queue depth runs away.
5. **Bombae taxonomy** — open question per spec Appendix D; don't onboard Bombae until signed off.
6. **Cross-product save (US-3.9)** — P1 not P0; Week 4 candidate.

---

## What ships in MVP (31 P0 stories per Appendix A)

- Admin: US-1.1, 1.2, 1.3, 1.4
- Sourcing: US-2.1, 2.2, 2.3, 2.4, 2.5, 2.6
- Queue: US-3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8
- Filters: US-4.1, 4.2, 4.3, 4.4, 4.5, 4.6
- Library: US-5.1, 5.2, 5.3, 5.4
- Brief integration: US-6.1
- Reports: US-7.1, 7.2, 7.3
- Senior review: US-8.1
- Data: US-9.1, 9.2

Everything P1 and P2 waits until MVP is in daily use by the team.
