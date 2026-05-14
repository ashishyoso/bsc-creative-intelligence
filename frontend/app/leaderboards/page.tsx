'use client';
import { useEffect, useState } from 'react';
import { LeaderboardResponse, api, fmtMoney, fmtNum, fmtPct } from '../lib/api';
import FilteredAssetsDrawer from '../components/FilteredAssetsDrawer';
import { TableSkeleton } from '../components/Skeletons';

// Map a leaderboard dimension name to the URL filter the Library page expects.
const DIMENSION_FILTER_KEY: Record<string, string> = {
  hook_archetype: 'hook_archetype',
  format: 'format',
  audio_type: 'audio_type',
  audio_language: 'audio_language',
  persona_implied: 'persona_implied',
  awareness_stage: 'awareness_stage',
  talent_type: 'talent_type',
  setting: 'setting',
  brand_visible_first_3s: 'brand_visible_first_3s',
  sku: 'sku',
};

const DIMENSIONS = [
  { v: 'hook_archetype', l: 'Hook Archetype' },
  { v: 'format', l: 'Format' },
  { v: 'audio_type', l: 'Audio Type' },
  { v: 'audio_language', l: 'Audio Language' },
  { v: 'persona_implied', l: 'Persona' },
  { v: 'awareness_stage', l: 'Awareness Stage' },
  { v: 'talent_type', l: 'Talent Type' },
  { v: 'setting', l: 'Setting' },
  { v: 'brand_visible_first_3s', l: 'Brand <3s (Y/N)' },
  { v: 'sku', l: 'SKU' },
];

const METRICS = [
  { v: 'roas', l: 'ROAS' },
  { v: 'hook_rate', l: 'Hook Rate' },
  { v: 'hold_rate', l: 'Hold Rate' },
  { v: 'ctr', l: 'CTR' },
  { v: 'spend', l: 'Total Spend' },
];

function formatMetric(metric: string, v: number) {
  if (metric === 'spend') return fmtMoney(v);
  if (metric === 'roas') return fmtNum(v);
  return fmtPct(v);
}

export default function LeaderboardsPage() {
  const [dimension, setDimension] = useState('hook_archetype');
  const [drawerFilters, setDrawerFilters] = useState<Record<string, string> | null>(null);
  const [drawerTitle, setDrawerTitle] = useState('');
  const [metric, setMetric] = useState('roas');
  const [sku, setSku] = useState('');
  const [spendWeighted, setSpendWeighted] = useState(true);
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [skus, setSkus] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const r = await api.leaderboard({ dimension, metric, sku: sku || undefined, spend_weighted: spendWeighted });
      setData(r);
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { api.listSkus().then(setSkus).catch(() => {}); }, []);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [dimension, metric, sku, spendWeighted]);

  return (
    <div>
      <h1 className="page-title">Pattern Leaderboards</h1>
      <div className="toolbar">
        <label className="subtle">Dimension</label>
        <select value={dimension} onChange={(e) => setDimension(e.target.value)}>
          {DIMENSIONS.map((d) => <option key={d.v} value={d.v}>{d.l}</option>)}
        </select>
        <label className="subtle">Metric</label>
        <select value={metric} onChange={(e) => setMetric(e.target.value)}>
          {METRICS.map((d) => <option key={d.v} value={d.v}>{d.l}</option>)}
        </select>
        <label className="subtle">SKU</label>
        <select value={sku} onChange={(e) => setSku(e.target.value)}>
          <option value="">All</option>
          {skus.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <label className="subtle">
          <input type="checkbox" checked={spendWeighted} onChange={(e) => setSpendWeighted(e.target.checked)} /> spend-weighted
        </label>
        <span className="count">{loading ? 'Loading…' : data ? `${data.rows.length} rows` : ''}</span>
      </div>

      {error && <div className="panel" style={{ color: 'var(--danger)' }}>Error: {error}</div>}
      {data?.notes?.map((n, i) => (<div key={i} className="panel subtle">{n}</div>))}

      {loading && !data ? (
        <TableSkeleton rows={10} cols={7} />
      ) : (
      <div className="panel" style={{ padding: 0 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>{DIMENSIONS.find((d) => d.v === dimension)?.l}</th>
              <th>{METRICS.find((m) => m.v === metric)?.l} (mean)</th>
              <th>Median</th>
              <th>N</th>
              <th>Total Spend</th>
              <th>Confidence</th>
            </tr>
          </thead>
          <tbody>
            {data?.rows.map((r, i) => {
              const filterKey = DIMENSION_FILTER_KEY[dimension];
              const canDrillDown = !!filterKey;
              function drill() {
                if (!canDrillDown) return;
                const filters: Record<string, string> = { [filterKey]: r.value };
                if (sku) filters.sku = sku;
                setDrawerFilters(filters);
                setDrawerTitle(`${DIMENSIONS.find((d) => d.v === dimension)?.l}: ${r.value}`);
              }
              return (
                <tr
                  key={r.value}
                  onClick={drill}
                  style={canDrillDown ? { cursor: 'pointer' } : {}}
                  title={canDrillDown ? `Click to see all creatives where ${dimension} = "${r.value}"` : ''}
                >
                  <td>{i + 1}</td>
                  <td style={canDrillDown ? { color: 'var(--accent)' } : {}}>{r.value}</td>
                  <td>{formatMetric(metric, r.metric_value)}</td>
                  <td>{r.median !== null ? formatMetric(metric, r.median) : '—'}</td>
                  <td>{r.n}</td>
                  <td>{fmtMoney(r.total_spend)}</td>
                  <td><span className={`confidence ${r.confidence}`}>{r.confidence}</span></td>
                </tr>
              );
            })}
            {!data?.rows.length && !loading && (
              <tr><td colSpan={7}>
                <div className="empty">
                  <span className="empty-icon">📊</span>
                  <div className="empty-title">No patterns yet</div>
                  <div className="empty-hint">Run the ingest + tagging pipeline first. Patterns emerge once assets are tagged.</div>
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
        subtitle={sku ? `SKU: ${sku}` : undefined}
      />
    </div>
  );
}
