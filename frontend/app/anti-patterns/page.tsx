'use client';
import { useEffect, useState } from 'react';
import { api, fmtMoney, fmtNum, fmtPct } from '../lib/api';
import FilteredAssetsDrawer from '../components/FilteredAssetsDrawer';
import { TableSkeleton } from '../components/Skeletons';

type AntiPattern = Awaited<ReturnType<typeof api.antiPatterns>>['rows'][number];

const METRICS = [
  { v: 'roas', l: 'ROAS' },
  { v: 'hook_rate', l: 'Hook Rate' },
  { v: 'hold_rate', l: 'Hold Rate' },
  { v: 'ctr', l: 'CTR' },
];

const DIMENSION_LABEL: Record<string, string> = {
  sku: 'SKU', format: 'Format', hook_archetype: 'Hook Archetype',
  persona_implied: 'Persona', awareness_stage: 'Awareness', talent_type: 'Talent',
  setting: 'Setting', audio_language: 'Language', audio_type: 'Audio Type',
  brand_visible_first_3s: 'Brand <3s', follows_60pct_rule: '60% Rule',
};

function formatMetric(metric: string, v: number) {
  if (metric === 'roas') return fmtNum(v);
  return fmtPct(v);
}

export default function AntiPatternsPage() {
  const [metric, setMetric] = useState('roas');
  const [drawerFilters, setDrawerFilters] = useState<Record<string, string> | null>(null);
  const [drawerTitle, setDrawerTitle] = useState('');
  const [sku, setSku] = useState('');
  const [skus, setSkus] = useState<string[]>([]);
  const [minN, setMinN] = useState(3);
  const [topK, setTopK] = useState(50);
  const [includePairs, setIncludePairs] = useState(true);
  const [failPct, setFailPct] = useState(0.5);
  const [data, setData] = useState<Awaited<ReturnType<typeof api.antiPatterns>> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const r = await api.antiPatterns({
        metric, sku: sku || undefined, min_n: minN, top_k: topK,
        include_pairs: includePairs, fail_threshold_pct: failPct,
      });
      setData(r);
    } catch (e: any) { setError(e.message ?? String(e)); }
    finally { setLoading(false); }
  }

  useEffect(() => { api.listSkus().then(setSkus).catch(() => {}); }, []);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [metric, sku, minN, topK, includePairs, failPct]);

  function drill(r: AntiPattern) {
    const filters: Record<string, string> = { [r.dim_a]: r.val_a };
    if (r.dim_b && r.val_b) filters[r.dim_b] = r.val_b;
    if (sku) filters.sku = sku;
    setDrawerFilters(filters);
    const title = r.dim_b && r.val_b
      ? `${DIMENSION_LABEL[r.dim_a] ?? r.dim_a}: ${r.val_a}  +  ${DIMENSION_LABEL[r.dim_b] ?? r.dim_b}: ${r.val_b}`
      : `${DIMENSION_LABEL[r.dim_a] ?? r.dim_a}: ${r.val_a}`;
    setDrawerTitle(`Anti-pattern · ${title}`);
  }

  return (
    <div>
      <h1 className="page-title">Anti-patterns</h1>
      <div className="subtle" style={{ marginBottom: 14, fontSize: 13 }}>
        Tag values + combinations that consistently underperform the SKU benchmark.
        These are <strong>safe to avoid</strong> in new briefs.
      </div>

      <div className="toolbar">
        <label className="subtle">Metric</label>
        <select value={metric} onChange={(e) => setMetric(e.target.value)}>
          {METRICS.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}
        </select>

        <label className="subtle">SKU</label>
        <select value={sku} onChange={(e) => setSku(e.target.value)}>
          <option value="">All</option>
          {skus.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>

        <label className="subtle">Min N</label>
        <input type="number" value={minN} onChange={(e) => setMinN(Number(e.target.value) || 3)} style={{ width: 60 }} />

        <label className="subtle">Top</label>
        <input type="number" value={topK} onChange={(e) => setTopK(Number(e.target.value) || 30)} style={{ width: 60 }} />

        <label className="subtle">Fail threshold</label>
        <input type="number" step="0.1" value={failPct} onChange={(e) => setFailPct(Number(e.target.value) || 0.5)} style={{ width: 70 }} />

        <label className="subtle">
          <input type="checkbox" checked={includePairs} onChange={(e) => setIncludePairs(e.target.checked)} /> pairs
        </label>

        <span className="count">{loading ? 'Mining…' : data ? `${data.count} anti-patterns · benchmark ${formatMetric(metric, data.benchmark)}` : ''}</span>
      </div>

      {error && <div className="panel" style={{ color: 'var(--danger)' }}>Error: {error}</div>}

      {loading && !data ? (
        <TableSkeleton rows={10} cols={7} />
      ) : (
      <div className="panel" style={{ padding: 0 }}>
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Failed combination</th>
              <th>{METRICS.find((m) => m.v === metric)?.l}</th>
              <th>Deficit</th>
              <th>N</th>
              <th>Spend wasted</th>
              <th>Confidence</th>
            </tr>
          </thead>
          <tbody>
            {data?.rows.map((r, i) => (
              <tr key={`${r.dim_a}-${r.val_a}-${r.dim_b}-${r.val_b}-${i}`} onClick={() => drill(r)} style={{ cursor: 'pointer' }}>
                <td>{i + 1}</td>
                <td>
                  <span className="chip">
                    {DIMENSION_LABEL[r.dim_a] ?? r.dim_a}: <strong style={{ color: 'var(--danger)' }}>{r.val_a}</strong>
                  </span>
                  {r.dim_b && r.val_b && (
                    <>
                      <span style={{ margin: '0 6px' }}>+</span>
                      <span className="chip">
                        {DIMENSION_LABEL[r.dim_b] ?? r.dim_b}: <strong style={{ color: 'var(--danger)' }}>{r.val_b}</strong>
                      </span>
                    </>
                  )}
                </td>
                <td>{formatMetric(metric, r.metric_value)}</td>
                <td style={{ color: 'var(--danger)' }}>-{(r.deficit_pct * 100).toFixed(0)}%</td>
                <td>{r.n}</td>
                <td>{fmtMoney(r.total_spend)}</td>
                <td><span className={`confidence ${r.confidence}`}>{r.confidence}</span></td>
              </tr>
            ))}
            {!data?.rows.length && !loading && (
              <tr><td colSpan={7}>
                <div className="empty">
                  <span className="empty-icon">✓</span>
                  <div className="empty-title">No anti-patterns at this threshold</div>
                  <div className="empty-hint">Good sign — nothing's consistently failing for this SKU. Try raising the fail-threshold or lowering Min N to spot weaker losers.</div>
                </div>
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      )}

      <FilteredAssetsDrawer
        open={!!drawerFilters}
        onClose={() => setDrawerFilters(null)}
        filters={drawerFilters}
        title={drawerTitle}
        subtitle={`metric: ${metric}${sku ? ` · SKU: ${sku}` : ''}`}
      />
    </div>
  );
}
