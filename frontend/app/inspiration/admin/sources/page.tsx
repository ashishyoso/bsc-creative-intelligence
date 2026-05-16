'use client';
import { useEffect, useState } from 'react';
import InspirationNav from '../../components/InspirationNav';
import { insp, SourceChannel, SourceHealth } from '../../lib/api';

const HEALTH_COLOR = { green: '#4caf50', amber: '#ff9800', red: '#f44336' };
const TRIGGERABLE: SourceChannel[] = ['meta_ad_library', 'meta_marketing', 'youtube', 'tiktok', 'brand_site'];

export default function SourcesAdmin() {
  const [rows, setRows] = useState<SourceHealth[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<SourceChannel | null>(null);
  const [lastRunResult, setLastRunResult] = useState<{ source: string; ok: boolean; records?: number; error?: string } | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try { setRows(await insp.sourceHealth()); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  async function trigger(source: SourceChannel) {
    setRunning(source);
    setLastRunResult(null);
    try {
      const result = await insp.triggerIngest(source);
      setLastRunResult(result);
      await load();
    } catch (e: any) {
      setLastRunResult({ source, ok: false, error: e.message });
    } finally {
      setRunning(null);
    }
  }

  return (
    <main style={{ maxWidth: 1100 }}>
      <InspirationNav />
      <section className="panel">
        <h1>Source health (US-2.6)</h1>
        <p className="subtle">
          Per source: last successful pull, records in last run, 7-day total,
          and error count. Green ≤24h, amber 24–48h, red &gt;48h or recent error.
        </p>
        {error && <div className="panel" style={{ background: '#fee' }}>{error}</div>}
        {lastRunResult && (
          <div className="panel" style={{ background: lastRunResult.ok ? '#e8f5e9' : '#fee', color: '#222', marginTop: 12 }}>
            <strong>{lastRunResult.source}:</strong>{' '}
            {lastRunResult.ok
              ? `ran successfully — ${lastRunResult.records ?? 0} new records`
              : `failed — ${lastRunResult.error}`}
          </div>
        )}
        {loading ? <p>Loading…</p> : (
          <table style={{ width: '100%', marginTop: 12 }}>
            <thead><tr>
              <th align="left">Source</th>
              <th align="left">Health</th>
              <th align="left">Last pull</th>
              <th align="left">Last run records</th>
              <th align="left">7-day total</th>
              <th align="left">Errors (30d)</th>
              <th align="left">Last error</th>
              <th align="left">Trigger</th>
            </tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.source_channel}>
                  <td>{r.source_channel}</td>
                  <td>
                    <span style={{
                      display: 'inline-block', width: 10, height: 10, borderRadius: 5,
                      background: HEALTH_COLOR[r.health], marginRight: 6,
                    }} />
                    {r.health}
                  </td>
                  <td>{r.last_pull_at ? new Date(r.last_pull_at).toLocaleString() : '—'}</td>
                  <td>{r.last_pull_records ?? '—'}</td>
                  <td>{r.seven_day_records}</td>
                  <td>{r.error_count}</td>
                  <td className="subtle" style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.last_error ?? '—'}</td>
                  <td>
                    {TRIGGERABLE.includes(r.source_channel) && (
                      <button onClick={() => trigger(r.source_channel)} disabled={running !== null}>
                        {running === r.source_channel ? 'Running…' : 'Run now'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
