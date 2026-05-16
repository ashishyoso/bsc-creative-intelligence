'use client';
import { useEffect, useState } from 'react';
import InspirationNav from '../../components/InspirationNav';
import { insp, SourceHealth } from '../../lib/api';

const HEALTH_COLOR = { green: '#4caf50', amber: '#ff9800', red: '#f44336' };

export default function SourcesAdmin() {
  const [rows, setRows] = useState<SourceHealth[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
                  <td className="subtle" style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.last_error ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
