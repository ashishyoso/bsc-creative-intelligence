'use client';
import { useEffect, useState } from 'react';
import { api, fmtMoney, fmtNum, fmtPct } from '../lib/api';
import FilteredAssetsDrawer from '../components/FilteredAssetsDrawer';
import { PanelSkeleton } from '../components/Skeletons';

export default function PersonaCoveragePage() {
  const [sku, setSku] = useState('');
  const [drawerFilters, setDrawerFilters] = useState<Record<string, string> | null>(null);
  const [drawerTitle, setDrawerTitle] = useState('');
  const [skus, setSkus] = useState<string[]>([]);
  const [coverage, setCoverage] = useState<any>(null);
  const [matrix, setMatrix] = useState<any>(null);
  const [metric, setMetric] = useState('roas');
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.listSkus().then(setSkus).catch(() => {}); }, []);

  async function load() {
    setLoading(true);
    const [c, m] = await Promise.all([
      api.personaCoverage(sku || undefined).catch(() => null),
      api.personaMatrix(metric).catch(() => null),
    ]);
    setCoverage(c); setMatrix(m); setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [sku, metric]);

  function cellColor(val: number | null, samples: { metric_value: number | null }[]): string {
    if (val === null) return 'transparent';
    const vals = samples.map(s => s.metric_value).filter((v): v is number => v !== null);
    if (!vals.length) return 'transparent';
    const max = Math.max(...vals), min = Math.min(...vals);
    const t = max > min ? (val - min) / (max - min) : 0.5;
    // Color from soft pink (low) to hot pink (high)
    const alpha = 0.15 + t * 0.55;
    return `rgba(236, 72, 153, ${alpha.toFixed(2)})`;
  }

  function formatMetric(metric: string, v: number | null) {
    if (v === null) return '—';
    if (metric === 'roas') return fmtNum(v);
    return fmtPct(v);
  }

  return (
    <div>
      <div className="toolbar">
        <h1 className="page-title">Persona coverage</h1>
        <label className="subtle">SKU</label>
        <select value={sku} onChange={(e) => setSku(e.target.value)}>
          <option value="">All</option>
          {skus.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <label className="subtle">Matrix metric</label>
        <select value={metric} onChange={(e) => setMetric(e.target.value)}>
          <option value="roas">ROAS</option>
          <option value="hook_rate">Hook Rate</option>
          <option value="hold_rate">Hold Rate</option>
          <option value="ctr">CTR</option>
        </select>
        <span className="count">{loading ? 'Loading…' : ''}</span>
      </div>

      {loading && !coverage && (
        <>
          <PanelSkeleton lines={6} />
          <PanelSkeleton lines={5} />
        </>
      )}

      {/* Coverage table */}
      {coverage && (
      <div className="panel">
        <h2>Coverage (creative count + spend)</h2>
        {coverage && (
          <>
            <div className="subtle" style={{ fontSize: 12, marginBottom: 10 }}>
              {coverage.total_creatives} creatives · {fmtMoney(coverage.total_spend)} total spend
            </div>
            <table className="table">
              <thead><tr><th>Persona</th><th>Creatives</th><th>% of library</th><th>Spend</th><th>% of spend</th></tr></thead>
              <tbody>
                {coverage.rows.map((r: any) => (
                  <tr key={r.persona} onClick={() => {
                    const filters: Record<string, string> = { persona_implied: r.persona };
                    if (sku) filters.sku = sku;
                    setDrawerFilters(filters);
                    setDrawerTitle(`Persona: ${r.persona}`);
                  }} style={{ cursor: 'pointer' }}>
                    <td><strong>{r.persona}</strong></td>
                    <td>{r.creative_count}</td>
                    <td>{r.pct_of_creatives}%</td>
                    <td>{fmtMoney(r.spend)}</td>
                    <td>{r.pct_of_spend}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {coverage.gaps?.length > 0 && (
              <div className="panel" style={{ marginTop: 14, borderColor: 'var(--warn)' }}>
                <h3 style={{ fontSize: 12, color: 'var(--warn)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Coverage gaps</h3>
                <ul style={{ margin: '8px 0 0', paddingLeft: 18, lineHeight: 1.7, fontSize: 13 }}>
                  {coverage.gaps.map((g: any) => (
                    <li key={g.persona}>
                      <strong>{g.persona}</strong> — {g.reason}
                      <a style={{ marginLeft: 8, color: 'var(--accent)', fontSize: 12 }}
                         href={`/formula?persona=${encodeURIComponent(g.persona)}`}>
                        Brief this →
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
      )}

      {/* Persona × SKU matrix */}
      {matrix && matrix.cells?.length > 0 && (
        <div className="panel">
          <h2>Persona × SKU matrix ({metric})</h2>
          <div className="subtle" style={{ fontSize: 12, marginBottom: 10 }}>
            Spend-weighted {metric}. Cell intensity reflects relative performance. Click a cell to drill into the library.
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ position: 'sticky', left: 0, background: 'var(--bg-elev)' }}>Persona ↓ / SKU →</th>
                  {matrix.skus.map((s: string) => <th key={s}>{s}</th>)}
                </tr>
              </thead>
              <tbody>
                {matrix.personas.map((p: string) => (
                  <tr key={p}>
                    <td style={{ position: 'sticky', left: 0, background: 'var(--bg-elev)', fontWeight: 600 }}>{p}</td>
                    {matrix.skus.map((s: string) => {
                      const cell = matrix.cells.find((c: any) => c.persona === p && c.sku === s);
                      if (!cell || cell.metric_value === null) return <td key={s} className="subtle">—</td>;
                      return (
                        <td key={s}
                            onClick={() => {
                              setDrawerFilters({ persona_implied: p, sku: s });
                              setDrawerTitle(`Persona: ${p}  +  SKU: ${s}`);
                            }}
                            style={{
                              background: cellColor(cell.metric_value, matrix.cells),
                              cursor: 'pointer',
                              textAlign: 'center',
                              fontWeight: 600,
                            }}
                            title={`${cell.n} creatives · ${fmtMoney(cell.total_spend)} spend`}
                        >
                          {formatMetric(metric, cell.metric_value)}
                          <div style={{ fontSize: 10, fontWeight: 400, opacity: 0.7 }}>N={cell.n}</div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <FilteredAssetsDrawer
        open={!!drawerFilters}
        onClose={() => setDrawerFilters(null)}
        filters={drawerFilters}
        title={drawerTitle}
      />
    </div>
  );
}
