# Deploying YOSO-BSC to Railway + Supabase + Vercel

This is the migration path that **does not re-tag** the existing 998 assets.
Tags + performance data move via the Postgres migration script.
Videos + frames are re-hydrated in prod from the original CDN URLs.

Total wall-clock from "code pushed to GitHub" → "live in prod": **~70 minutes**.
Net new spend: **₹0** (everything's already tagged).

---

## 0 · Prereqs

- [ ] Local backend at `C:\bsc-app\backend` with a healthy SQLite DB at `C:\bsc-vault\db\bsc.sqlite`
- [ ] All 998 assets tagged (check `/ingest/tagging-progress` shows ~100% complete)
- [ ] **Rotated** Anthropic + OpenAI API keys (the ones earlier in chat are compromised)

## 1 · GitHub repo (5 min)

```powershell
cd C:\bsc-app
git init
git add .
git commit -m "Initial commit: YOSO-BSC Creative Intelligence pilot"
# Create a private repo at https://github.com/new called yoso-bsc-creative-intel
git remote add origin https://github.com/<your-username>/yoso-bsc-creative-intel.git
git branch -M main
git push -u origin main
```

`.gitignore` already excludes `.env`, `vault/`, `.venv`, `node_modules`. **Verify** the push doesn't include any `.env` file. If `git status` shows `backend/.env` before pushing, stop and add it to `.gitignore`.

## 2 · Supabase Postgres (5 min)

1. Go to https://supabase.com → New project. Pick a region near Mumbai (e.g. `ap-south-1`).
2. Once provisioned, go to **Settings → Database → Connection string → URI** format.
3. Copy the URI. It looks like `postgresql://postgres:<pass>@<host>.supabase.co:5432/postgres`.
4. **Save the password.** Don't paste in chat or anywhere public.

## 3 · Run the migration locally (5 min)

This copies the entire local SQLite DB to Supabase Postgres. Re-runnable (skips existing rows).

```powershell
cd C:\bsc-app\backend
$env:DATABASE_URL = "postgresql://postgres:<your-password>@<host>.supabase.co:5432/postgres"
.\.venv\Scripts\python.exe scripts\migrate_to_postgres.py
```

Expected output:
```
Source SQLite: sqlite:///C:/bsc-vault/db/bsc.sqlite
Target Postgres: <host>.supabase.co:5432/postgres
Creating Postgres schema (if not already present)…
  ingests                 1 rows inserted (skipped 0)
  concepts                97 rows inserted (skipped 0)
  assets                  999 rows inserted (skipped 0)
  ad_references           834 rows inserted (skipped 0)
  performance_rows        1000 rows inserted (skipped 0)
  auto_tags               998 rows inserted (skipped 0)
  ...
Migration complete. ~4000 rows inserted.
```

The script automatically rewrites `Asset.storage_path` from `C:\bsc-vault\videos\XXX.mp4` to `videos/XXX.mp4` so the prod container can find them after rehydrate.

## 4 · Railway (10 min)

1. Go to https://railway.app → New Project → "Deploy from GitHub repo" → select your `yoso-bsc-creative-intel` repo.
2. Railway will auto-detect `backend/Dockerfile` and start building. It may build a "monorepo" worker — if so, set the **Root Directory** in Settings to `/` and confirm the Dockerfile path is `backend/Dockerfile`.
3. **Add a persistent volume** for the vault:
   - Service → Settings → Volumes → New Volume
   - Mount path: `/app/vault`
   - Size: 50 GB (you'll use ~25-40GB for the 999 videos + frames)
4. **Set env vars** (Service → Variables):
   ```
   DATABASE_URL=postgresql://postgres:<password>@<host>.supabase.co:5432/postgres
   ANTHROPIC_API_KEY=<rotated key>
   OPENAI_API_KEY=<rotated key>
   VAULT_ROOT=/app/vault
   BASIC_AUTH_USER=yoso
   BASIC_AUTH_PASS=<your shared password>
   VISION_MODEL=claude-sonnet-4-6
   WHISPER_MODEL=whisper-1
   CORS_ORIGINS=https://yoso-bsc-creative-intel.vercel.app
   ```
   (Replace the CORS_ORIGINS once you know your Vercel URL.)
5. Trigger a redeploy. Build takes ~3 min.
6. Note the public URL — something like `yoso-bsc-creative-intel-production.up.railway.app`.

## 5 · Rehydrate the vault (10 min)

Now the prod backend has the DB but the vault is empty. Trigger the re-download:

```powershell
$prod = "https://yoso-bsc-creative-intel-production.up.railway.app"
$auth = "Basic " + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("yoso:<your password>"))

# Re-download all 999 videos from their CDN URLs into the Railway volume
curl.exe -X POST "$prod/admin/rehydrate-vault" -H "Authorization: $auth"
# Returns { "job_id": "xxx" }

# Poll progress
curl.exe "$prod/ingest/jobs/<job_id>" -H "Authorization: $auth"
```

Expected: ~999 videos download in ~10 min (Railway → Hawky CDN is fast). The script also re-runs ffprobe to populate `actual_width/height` for any asset missing them.

Then rebuild frames (no LLM, just ffmpeg):

```powershell
curl.exe -X POST "$prod/admin/rebuild-frames" -H "Authorization: $auth"
```

~5 min on 999 assets.

Finally rebuild the hook library:

```powershell
curl.exe -X POST "$prod/hooks/rebuild" -H "Authorization: $auth"
```

~10 sec.

## 6 · Vercel (5 min)

1. https://vercel.com → New Project → import your GitHub repo.
2. **Root Directory**: `frontend`
3. Framework: Next.js (auto-detected)
4. **Environment Variables**:
   ```
   NEXT_PUBLIC_API_URL=https://yoso-bsc-creative-intel-production.up.railway.app
   ```
5. Deploy. ~2 min build.
6. Once deployed, copy the URL (e.g. `yoso-bsc-creative-intel.vercel.app`).
7. Go back to Railway → update `CORS_ORIGINS` to include that Vercel URL.

## 7 · Smoke test (5 min)

Open the Vercel URL in browser. Basic auth prompt → enter `yoso` / your password.

Verify:
- [ ] Library shows 999 creatives
- [ ] Click a card → drawer opens with video playable
- [ ] Hover on a card → thumbnail loads (frame from prod)
- [ ] Leaderboards → click a row → filtered drawer opens with creatives
- [ ] Magic Formula → SKU=FBT SE → Generate → returns recommendations
- [ ] Briefs / Hooks / Concepts → render data
- [ ] Quality → 60% rule + brand-first-3s populated

If anything's broken, check `Railway logs` (Service → Deployments → Logs).

## 8 · Retry the 1 failed tag (1 min)

Asset `89aee487bb5fff6d` failed during pilot tagging (Claude returned malformed JSON). To retry just that one:

```powershell
curl.exe -X POST "$prod/admin/retry-failed-tags" `
  -H "Authorization: $auth" -H "Content-Type: application/json" `
  -d '["89aee487bb5fff6d"]'
```

Cost: ~₹1.50.

---

## Operational notes

- **CI/CD**: any push to `main` auto-deploys both Railway (backend) and Vercel (frontend). No extra config needed.
- **Backups**: Supabase free tier has automatic backups for 7 days. Pro tier extends this.
- **Cost estimate**: Railway ~$5-10/mo for a single Hobby service + volume + bandwidth. Supabase free tier covers up to 500MB of Postgres data (we use ~5MB). Vercel free tier is generous for one project.
- **Vault size growth**: when vault exceeds 50GB, move to Supabase Storage or S3. Backend already has the abstraction (`resolve_asset_path`) — would need an S3-backed implementation.
- **API keys**: rotate periodically. The ones from chat earlier are leaked. Use new ones in prod.

## Troubleshooting

### "Connection refused" on basic auth
Check `BASIC_AUTH_USER` and `BASIC_AUTH_PASS` are set in Railway env vars. They must both be set or auth is disabled entirely.

### Media files 404 after rehydrate
Run `POST /admin/normalize-paths` once — this rewrites any leftover absolute Windows paths in `Asset.storage_path` to relative format.

### Tagging job hangs in prod
Railway's HTTP request limit is 5 min. The job pattern we use spawns a background thread so the HTTP response returns immediately with a job_id. If you see a 504 from the UI, refresh — the job is still running in the background. Use `GET /ingest/jobs/{id}` to check.

### "Out of memory" on Railway during ingest
Railway Hobby tier gives 8GB RAM. The download phase shouldn't hit that. If it does, lower `DOWNLOAD_CONCURRENCY` env var from 8 to 4.

### Frame thumbnails 404
After rehydrate, run `POST /admin/rebuild-frames` to re-extract frames. They're not in the DB — only on disk.
