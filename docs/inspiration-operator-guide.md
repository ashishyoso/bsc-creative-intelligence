# BSC Creative Intelligence — Operator Guide

For: Hardik, Aman, Gaurav, Priyanshu, Samyukta · Strategists · Ops Lead · Senior Reviewers
Status: live at https://bsc-creative-intelligence.vercel.app/inspiration

The tool is currently in **open mode** — no login required. Every decision is attributed to a shared "Anonymous" user until Google SSO is wired. Save with care; the audit log can't tell who did what yet.

---

## 1. Map of the surface

| URL | What it's for |
|---|---|
| `/inspiration` | Hub — links to every section |
| `/inspiration/queue` | Daily swipe — review pending videos, save / reject / escalate |
| `/inspiration/library` | Saved references organised by route board |
| `/inspiration/briefs` | Brief manifests — anchor product × route + ≥2 refs to approve |
| `/inspiration/review` | Senior reviewer escalation queue |
| `/inspiration/reports` | Decisions log + source volume + route coverage |
| `/inspiration/admin/products` | Product taxonomy (FBT SE, BLO Trimmer, …) |
| `/inspiration/admin/routes` | Per-product routes — design tone, hard-no list, format notes |
| `/inspiration/admin/watchlist` | Per-source brand × source-channel watchlist |
| `/inspiration/admin/sources` | Source pull health dashboard |
| `/inspiration/admin/manual` | Hand-feed videos by URL (single or bulk paste) |

---

## 2. Editor's daily 20 minutes

> Target: clear 30–60 videos per session.

1. Open **/inspiration/queue**.
2. **Product selector** isn't wired into the queue yet — currently shows all pending videos across products. (Will be product-scoped once we ingest at scale.)
3. For each card:
   - Watch (autoplay, muted by default — unmute via player controls)
   - **`S`** to save (or click Save). Mandatory tagging modal opens:
     - Product · Route · Replicability (Yes / Stretch / No) · Why-it-works (≥20 chars)
     - Optional: cross-product save (one video can become a reference on multiple products)
   - **`R`** to reject — pick a reason. "other" needs ≥10 char detail
   - **`E`** to escalate to senior review (1-line context optional)
   - **`J` / `↓`** next · **`K` / `↑`** previous · spacebar play/pause
4. Save modal **why-it-works** is the load-bearing field — this is what makes the reference reusable in a brief later. Don't write "good ad". Write what specifically works: the hook, the structure, the casting, the end frame.

### Replicability — pick honestly
- **Yes** — current team can replicate confidently
- **Stretch** — current team can attempt with senior oversight
- **No** — aspirational only, requires external talent

This filter shows up later when a strategist pulls references for a brief — picking too aggressively here puts unreachable refs in front of weak editors.

---

## 3. Strategist's brief workflow (US-6.1 forcing function)

> No brief gets approved without ≥2 references from the matching route board.

1. **/inspiration/briefs/new** — title, product, route, optional external doc URL (Notion / Google Doc / wherever the brief body lives), goal, notes.
2. On the brief detail page, click **+ Attach reference**.
3. Picker shows ONLY references saved on that product × route. Pick at least two.
4. Click **Approve for production**.
   - If <2 refs → 422 error
   - If 2+ refs → status flips to `approved` with timestamp

Each attached reference also shows up on its own reference detail page under "Used in" — that's the audit chain from the source video to the production decision.

---

## 4. Source health (Ops Lead)

**/inspiration/admin/sources** — every source channel is currently 🔴 red because no automated ingest worker has run yet.

To turn ingestion on, in Railway env vars:
1. Set the source credentials (see [`docs/inspiration-build-plan.md`](./inspiration-build-plan.md) Day 0–2 table)
2. Set `INSPIRATION_SCHEDULER=on`
3. Redeploy

Then sources will turn 🟢 green within 24h of their first pull.

---

## 5. Manual override workflow

Use **/inspiration/admin/manual** when:
- A video came up in conversation and needs to enter the queue
- Automated ingest missed something obvious
- You're seeding the system before ingest is live

**Bulk paste mode**: one URL per line + a single brand for the batch. The tool auto-detects YouTube / Reel / TikTok / Vimeo / Meta Ad Library URLs.

---

## 6. Senior review queue

**/inspiration/review** — when an editor hits `E`, the video lands here. Actions:
- **Save** (full tagging required, same modal as queue)
- **Reject** (reason required)
- **Send back to editor** (status returns to pending; the original escalator can't re-escalate it)

Slack/email alert when queue >10 items is coded but not wired yet.

---

## 7. Common pitfalls

- **Why-text shorter than 20 chars** → save modal won't submit
- **Reject "other" missing detail** → modal won't submit
- **YouTube videos showing "Video unavailable"** in queue → the video was deleted on YouTube; reject with `irrelevant_for_product`
- **Brief approval blocked** → check the brief is on the same route as the references you're attaching (refs on `Vault` can't be attached to a `Baitsy` brief)
- **Anonymous user attribution** → real Google SSO comes later; for now treat the system like a shared notebook

---

## 8. What's intentionally NOT in MVP

Per `BSC_Creative_Intelligence_Tool_User_Stories.pdf` v1.0, the following are explicit Phase 2:

- AI route auto-classification on ingest
- Frame extraction / OCR / transcription
- Editor taste-match queue sorting (US-4.10)
- Disagreement filter for the Founder (US-4.11)
- Performance loop joining references → briefs → Hawky ROAS (US-7.7)
- Bidirectional Notion sync — current one-way (tool → Notion route board) is the planned MVP behaviour

Don't expect these. Don't ask why they're missing.

---

## 9. If something breaks

1. Backend health: `curl https://bsc-creative-intelligence.vercel.app/api/health` — should return `{ok:true,db_dialect:postgresql,…}`
2. Logs: Railway dashboard → `beautiful-reverence` project → `bsc-creative-intelligence` service → Deployments → View logs
3. Frontend build: Vercel dashboard → `bsc-creative-intelligence` project → Deployments
4. Ping Ashish or check the build plan: [`docs/inspiration-build-plan.md`](./inspiration-build-plan.md)
