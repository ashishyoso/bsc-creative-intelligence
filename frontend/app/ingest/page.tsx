'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

type LiveTagging = Awaited<ReturnType<typeof api.taggingProgress>>;

const STEPS = [
  { key: 'parse',    label: '1 · Parse XLSX' },
  { key: 'download', label: '2 · Download' },
  { key: 'verify',   label: '3 · Verify mapping' },
  { key: 'tag',      label: '4 · Auto-tag' },
  { key: 'done',     label: '5 · Done' },
] as const;

function ProgressBar({ pct, label }: { pct: number; label?: string }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="progress">
      <div className="progress-fill" style={{ width: `${clamped}%` }} />
      <div className="progress-label">{label ?? `${clamped.toFixed(1)}%`}</div>
    </div>
  );
}

function StepStrip({ phase, jobStatus, ingestPct, tagPct }: {
  phase: string; jobStatus?: string; ingestPct: number; tagPct: number;
}) {
  // Determine which step is active based on phase + counts
  let active = 'parse';
  if (phase === 'ingesting') active = ingestPct > 0 && ingestPct < 100 ? 'download' : 'parse';
  else if (phase === 'tagging') active = 'tag';
  if (jobStatus === 'done') active = 'done';

  function status(key: string): 'done' | 'active' | 'pending' {
    const order = ['parse', 'download', 'verify', 'tag', 'done'];
    const cur = order.indexOf(active);
    const me = order.indexOf(key);
    if (jobStatus === 'done') return 'done';
    if (me < cur) return 'done';
    if (me === cur) return 'active';
    return 'pending';
  }

  return (
    <div className="steps">
      {STEPS.map((s) => {
        const st = status(s.key);
        return (
          <div key={s.key} className={`step ${st}`}>
            <div className="step-label">{s.label}</div>
            <div className="step-status">
              {st === 'done' ? '✓ Done' : st === 'active' ? 'In progress' : 'Waiting'}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function IngestPage() {
  const [xlsxPath, setXlsxPath] = useState('G:/My Drive/Claude Records/BSC Content Intelligence/Hawky data/Bombay_Shaving_Company_Dashboard_13-05-2026.xlsx');
  const [monthTag, setMonthTag] = useState('Month 1 - May 2026');
  const [limit, setLimit] = useState(100);
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<any>(null);
  const [live, setLive] = useState<LiveTagging | null>(null);
  const [health, setHealth] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const jobPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const livePollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { api.health().then(setHealth).catch(() => {}); }, []);

  // Always poll the DB-backed tagging progress (works even when no in-memory job)
  useEffect(() => {
    function tick() { api.taggingProgress().then(setLive).catch(() => {}); }
    tick();
    livePollRef.current = setInterval(tick, 3000);
    return () => { if (livePollRef.current) clearInterval(livePollRef.current); };
  }, []);

  useEffect(() => () => {
    if (jobPollRef.current) clearInterval(jobPollRef.current);
  }, []);

  function startJobPolling(jobId: string) {
    if (jobPollRef.current) clearInterval(jobPollRef.current);
    jobPollRef.current = setInterval(async () => {
      try {
        const j = await api.getJob(jobId);
        setJob(j);
        if (j.status === 'done' || j.status === 'failed') {
          if (jobPollRef.current) { clearInterval(jobPollRef.current); jobPollRef.current = null; }
          setBusy(false);
        }
      } catch (e: any) {
        setError(e.message ?? String(e));
        if (jobPollRef.current) { clearInterval(jobPollRef.current); jobPollRef.current = null; }
        setBusy(false);
      }
    }, 2000);
  }

  async function runIngest() {
    setBusy(true); setError(null); setJob(null);
    try {
      const r = await api.runIngest({ xlsx_path: xlsxPath, month_tag: monthTag, limit, auto_tag: true });
      const initial = await api.getJob(r.job_id);
      setJob(initial);
      startJobPolling(r.job_id);
    } catch (e: any) {
      setError(e.message ?? String(e));
      setBusy(false);
    }
  }

  async function runTagOnly() {
    setBusy(true); setError(null); setJob(null);
    try {
      const r = await api.tagPending();
      const initial = await api.getJob(r.job_id);
      setJob(initial);
      startJobPolling(r.job_id);
    } catch (e: any) {
      setError(e.message ?? String(e));
      setBusy(false);
    }
  }

  // Compute the various progress numbers — strictly per-job, not mixed with
  // the historical "live" panel state.
  const ingestSummary = job?.progress?.ingest_summary;
  const dlDone = job?.progress?.done ?? ingestSummary?.downloaded ?? 0;
  const dlTotal = job?.progress?.total ?? ingestSummary?.unique_urls ?? limit;
  const ingestPct = dlTotal > 0 ? (dlDone / dlTotal) * 100 : 0;

  // For the JOB display, use only the job's tagging state — falling back to
  // `live` would mix in already-tagged assets from prior runs.
  const tagFromJob = job?.progress?.tagging;
  const tagDone = tagFromJob?.done ?? 0;
  const tagTotal = tagFromJob?.total ?? 0;
  const tagPct = tagTotal > 0 ? (tagDone / tagTotal) * 100 : 0;
  const tagCost = tagFromJob?.cost_inr ?? 0;

  // Overall: weighted by phase. Ingest is ~30% of total work, tagging ~70%.
  // While ingesting, tag hasn't started so don't credit it. Once tagging begins,
  // ingest is locked at 100%.
  const overallPct = job?.phase === 'tagging' || job?.status === 'done'
    ? 30 + (tagPct * 0.70)
    : ingestPct * 0.30;

  const phaseLabel = job?.phase === 'ingesting'
    ? 'Phase 1 — downloading + verifying'
    : job?.phase === 'tagging'
    ? 'Phase 2 — extracting frames, transcribing, tagging via Claude'
    : '';

  return (
    <div>
      <h1 className="page-title">Ingest pipeline</h1>

      <div className="panel">
        <h2>Health</h2>
        {!health ? (
          <div className="subtle">Checking backend…</div>
        ) : (
          <div className="kv">
            <div className="k">Vault</div><div>{health.vault_root}</div>
            <div className="k">DB</div><div>{health.db_path}</div>
            <div className="k">Anthropic key</div><div style={{ color: health.anthropic_key_set ? 'var(--good)' : 'var(--danger)' }}>{health.anthropic_key_set ? 'configured' : 'NOT SET — auto-tagging will be skipped'}</div>
            <div className="k">OpenAI key</div><div style={{ color: health.openai_key_set ? 'var(--good)' : 'var(--warn)' }}>{health.openai_key_set ? 'configured' : 'NOT SET — transcription will be skipped'}</div>
          </div>
        )}
      </div>

      {/* Always-on live progress (DB-backed, works for any running job) */}
      {live && live.eligible_total > 0 && (
        <div className="panel">
          <h2>Live tagging progress (DB-backed)</h2>
          <ProgressBar
            pct={live.pct_complete}
            label={`${live.tagged} / ${live.eligible_total} tagged · ${live.pct_complete.toFixed(1)}%`}
          />
          <div className="kv" style={{ gridTemplateColumns: '180px 1fr' }}>
            <div className="k">Tagged</div><div>{live.tagged}</div>
            <div className="k">Remaining</div><div>{live.remaining}</div>
            <div className="k">Total cost so far</div><div>₹{live.total_cost_inr.toFixed(2)}</div>
            <div className="k">Avg per asset</div><div>{live.avg_cost_per_asset_inr !== null ? `₹${live.avg_cost_per_asset_inr.toFixed(3)}` : '—'}</div>
            <div className="k">Mapping suspect</div><div>{live.mapping_suspect}</div>
            <div className="k">Download failed</div><div>{live.download_failed}</div>
          </div>
        </div>
      )}

      <div className="panel">
        <h2>Run ingest</h2>
        <div className="kv" style={{ gridTemplateColumns: '160px 1fr' }}>
          <div className="k">XLSX path</div>
          <input value={xlsxPath} onChange={(e) => setXlsxPath(e.target.value)} style={{ width: '100%', padding: 8, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 4 }} />
          <div className="k">Month tag</div>
          <input value={monthTag} onChange={(e) => setMonthTag(e.target.value)} style={{ width: 240, padding: 8, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 4 }} />
          <div className="k">Row limit</div>
          <input type="number" value={limit} onChange={(e) => setLimit(Number(e.target.value))} style={{ width: 120, padding: 8, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 4 }} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="btn" disabled={busy} onClick={runIngest}>
            {busy ? 'Running…' : `Ingest + tag (limit=${limit})`}
          </button>
          <button className="btn secondary" disabled={busy} onClick={runTagOnly}>
            Tag pending only
          </button>
        </div>
        {error && <div style={{ color: 'var(--danger)', marginTop: 10 }}>Error: {error}</div>}
      </div>

      {job && (
        <div className="panel">
          <h2>
            Job {job.id} — <span style={{
              color: job.status === 'done' ? 'var(--good)' :
                     job.status === 'failed' ? 'var(--danger)' :
                     job.status === 'running' ? 'var(--mid)' : 'var(--text-dim)'
            }}>{job.status}</span>
          </h2>

          <StepStrip phase={job.phase} jobStatus={job.status} ingestPct={ingestPct} tagPct={tagPct} />

          <div className="kv" style={{ gridTemplateColumns: '180px 1fr' }}>
            <div className="k">Overall</div>
            <div><ProgressBar pct={overallPct} label={`${overallPct.toFixed(1)}%`} /></div>

            {job.phase === 'ingesting' && (
              <>
                <div className="k">Downloading</div>
                <div><ProgressBar pct={ingestPct} label={`${dlDone} / ${dlTotal}`} /></div>
              </>
            )}

            {(job.phase === 'tagging' || tagFromJob) && (
              <>
                <div className="k">Tagging</div>
                <div>
                  <ProgressBar pct={tagPct} label={`${tagDone} / ${tagTotal} · ₹${tagCost.toFixed(2)}`} />
                  {tagFromJob?.last_asset_id && (
                    <div className="subtle" style={{ fontSize: 11, marginTop: 4 }}>
                      Last: <code>{tagFromJob.last_asset_id}</code>
                      {tagFromJob.last_sku && ` · ${tagFromJob.last_sku}`}
                      {tagFromJob.last_archetype && ` · ${tagFromJob.last_archetype}`}
                    </div>
                  )}
                </div>
              </>
            )}

            <div className="k">Phase</div><div>{phaseLabel || '—'}</div>
            {job.duration_seconds !== null && (<><div className="k">Duration</div><div>{job.duration_seconds?.toFixed(1)}s</div></>)}
          </div>

          {job.progress?.ingest_summary && job.status === 'done' && (
            <div style={{ marginTop: 14 }}>
              <h3 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-dim)', margin: '0 0 6px' }}>Ingest summary</h3>
              <pre style={{ fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'pre-wrap' }}>{JSON.stringify(job.progress.ingest_summary, null, 2)}</pre>
            </div>
          )}
          {job.progress?.tag_summary && job.status === 'done' && (
            <div style={{ marginTop: 14 }}>
              <h3 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-dim)', margin: '0 0 6px' }}>Tagging summary</h3>
              <pre style={{ fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'pre-wrap' }}>{JSON.stringify(job.progress.tag_summary, null, 2)}</pre>
            </div>
          )}
          {job.error && (
            <div style={{ marginTop: 14 }}>
              <h3 style={{ fontSize: 12, color: 'var(--danger)' }}>Error</h3>
              <pre style={{ fontSize: 11, color: 'var(--danger)', whiteSpace: 'pre-wrap' }}>{job.error}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
