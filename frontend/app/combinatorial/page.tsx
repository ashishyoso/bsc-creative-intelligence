'use client';
import { useEffect, useState } from 'react';
import { api, fmtMoney, fmtNum, fmtPct } from '../lib/api';
import FilteredAssetsDrawer from '../components/FilteredAssetsDrawer';
import { TableSkeleton } from '../components/Skeletons';

type Combo = Awaited<ReturnType<typeof api.combinatorial>>['rows'][number];

const METRICS = [
  { v: 'roas', l: 'ROAS' },
  { v: 'hook_rate', l: 'Hook Rate' },
  { v: 'hold_rate', l: 'Hold Rate' },
  { v: 'ctr', l: 'CTR' },
  { v: 'spend', l: 'Total Spend' },
];

const DIMENSION_LABEL: Record<string, string> = {
  sku: 'SKU',
  format: 'Format',
  hook_archetype: 'Hook Archetype',
  persona_implied: 'Persona',
  awareness_stage: 'Awareness',
  talent_type: 'Talent',
  setting: 'Setting',
  audio_language: 'Language',
  audio_type: 'Audio Type',
  brand_visible_first_3s: 'Brand <3s',
  follows_60pct_rule: '60% Rule',
};

function formatMetric(metric: string, v: number) {
  if (metric === 'spend') return fmtMoney(v);
  if (metric === 'roas') return fmtNum(v);
  return fmtPct(v);
}

export default function CombinatorialPage() {
  const [metric, setMetric] = useState('roas');
  const [drawerFilters, setDrawerFilters] = useState<Record<string, string> | null>(null);
  const [drawerTitle, setDrawerTitle] = useState('');
  const [sku, setSku] = useState('');
  const [pinDim, setPinDim] = useState('');
  const [minN, setMinN] = useState(3);
  const [topK, setTopK] = useState(50);
  const [spendWeighted, setSpendWeighted] = useState(true);

  const [data, setData] = useState<Awaited<ReturnType<typeof api.combinatorial>> | null>(null);
  const [skus, setSkus] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const r = await api.combinatorial({
        metric,
        sku: sku || undefined,
        pin_dimension: pinDim || undefined,
        min_n: minN,
        top_k: topK,
        spend_weighted: spendWeighted,
      });
      setData(r);
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { api.listSkus().then(setSkus).catch(() => {}); }, []);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [metric, sku, pinDim, minN, topK, spendWeighted]);

  function drill(c: Combo) {
    const filters: Record<string, string> = { [c.dim_a]: c.val_a, [c.dim_b]: c.val_b };
    if (sku) filters.sku = sku;
    setDrawerFilters(filters);
    setDrawerTitle(
      `${DIMENSION_LABEL[c.dim_a] ?? c.dim_a}: ${c.val_a}  +  ${DIMENSION_LABEL[c.dim_b] ?? c.dim_b}: ${c.val_b}`,
    );
  }

  return (
    <div>
      <h1 className="page-title">Combinatorial patterns</h1>
      <div className="subtle" style={{ marginBottom: 14, fontSize: 13 }}>
        Pairs of tag values ranked by metric. Click a row to see the creatives behind it.
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

        <label className="subtle">Pin dimension</label>
        <select value={pinDim} onChange={(e) => setPinDim(e.target.value)}>
          <option value="">— none —</option>
          {data?.available_dimensions?.map((d) => <option key={d} value={d}>{DIMENSION_LABEL[d] ?? d}</option>)}
        </select>

        <label className="subtle">Min N</label>
        <input type="number" value={minN} onChange={(e) => setMinN(Number(e.target.value) || 3)} style={{ width: 60 }} />

        <label className="subtle">Top</label>
        <input type="number" value={topK} onChange={(e) => setTopK(Number(e.target.value) || 50)} style={{ width: 60 }} />

        <label className="subtle">
          <input type="checkbox" checked={spendWeighted} onChange={(e) => setSpendWeighted(e.target.checked)} /> spend-weighted
        </label>

        <span className="count">{loading ? 'Mining…' : data ? `${data.count} pairs` : ''}</span>
      </div>

      {error && <div className="panel" style={{ color: 'var(--danger)' }}>Error: {error}</div>}

      {loading && !data ? (
        <TableSkeleton rows={10} cols={7} />
      ) : (
      <div className="panel" style={{ padding: 0 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Combination</th>
              <th>{METRICS.find((m) => m.v === metric)?.l}</th>
              <th>Median</th>
              <th>N</th>
              <th>Total Spend</th>
              <th>Confidence</th>
            </tr>
          </thead>
          <tbody>
            {data?.rows.map((r, i) => (
              <tr
                key={`${r.dim_a}=${r.val_a}|${r.dim_b}=${r.val_b}`}
                onClick={() => drill(r)}
                style={{ cursor: 'pointer' }}
                title="Click to see the creatives behind this combination"
              >
                <td>{i + 1}</td>
                <td>
                  <span className="chip" style={{ marginRight: 6 }}>
                    {DIMENSION_LABEL[r.dim_a] ?? r.dim_a}: <strong style={{ color: 'var(--accent)' }}>{r.val_a}</strong>
                  </span>
                  +
                  <span className="chip" style={{ marginLeft: 6 }}>
                    {DIMENSION_LABEL[r.dim_b] ?? r.dim_b}: <strong style={{ color: 'var(--accent)' }}>{r.val_b}</strong>
                  </span>
                </td>
                <td>{formatMetric(metric, r.metric_value)}</td>
                <td>{r.median !== null ? formatMetric(metric, r.median) : '—'}</td>
                <td>{r.n}</td>
                <td>{fmtMoney(r.total_spend)}</td>
                <td><span className={`confidence ${r.confidence}`}>{r.confidence}</span></td>
              </tr>
            ))}
            {!data?.rows.length && !loading && (
              <tr><td colSpan={7}>
                <div className="empty">
                  <span className="empty-icon">🧬</span>
                  <div className="empty-title">No combinations meet N≥{minN}</div>
                  <div className="empty-hint">Lower Min N, or wait for more tagged assets. Pairs need at least 3 creatives sharing both tag values.</div>
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
