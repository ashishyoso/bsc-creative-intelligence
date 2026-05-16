'use client';
import { useEffect, useState } from 'react';
import InspirationNav from '../components/InspirationNav';
import { insp, DecisionLogRow, Product, RouteCoverageRow, SourceVolumeRow } from '../lib/api';

type Tab = 'decisions' | 'source_volume' | 'route_coverage';

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>('decisions');
  return (
    <main style={{ maxWidth: 1200 }}>
      <InspirationNav />
      <section className="panel" style={{ marginBottom: 12 }}>
        <h1>Reports</h1>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button onClick={() => setTab('decisions')} className={tab === 'decisions' ? 'nav-active' : ''}>Decisions log (US-7.1)</button>
          <button onClick={() => setTab('source_volume')} className={tab === 'source_volume' ? 'nav-active' : ''}>Source volume (US-7.2)</button>
          <button onClick={() => setTab('route_coverage')} className={tab === 'route_coverage' ? 'nav-active' : ''}>Route coverage (US-7.3)</button>
        </div>
      </section>
      {tab === 'decisions' && <DecisionsTab />}
      {tab === 'source_volume' && <SourceVolumeTab />}
      {tab === 'route_coverage' && <RouteCoverageTab />}
    </main>
  );
}

function DecisionsTab() {
  const [rows, setRows] = useState<DecisionLogRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    insp.decisionsLog({ limit: 500 }).then(setRows).catch(e => setError(e.message));
  }, []);
  return (
    <section className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h2>Decisions log</h2>
        <a href="/api/inspiration/reports/decisions.csv" download>Download CSV</a>
      </div>
      {error && <div className="panel" style={{ background: '#fee' }}>{error}</div>}
      <table style={{ width: '100%', marginTop: 8 }}>
        <thead><tr>
          <th align="left">When</th><th align="left">Editor</th><th align="left">Action</th>
          <th align="left">Brand</th><th align="left">Source</th>
          <th align="left">Product</th><th align="left">Route</th><th align="left">Replicability</th>
          <th align="left">Reason</th>
        </tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id}>
              <td>{new Date(r.decided_at).toLocaleString()}</td>
              <td>{r.editor_name ?? r.editor_user_id}</td>
              <td>{r.action}</td>
              <td>{r.brand}</td>
              <td>{r.source_channel}</td>
              <td>{r.product_name ?? '—'}</td>
              <td>{r.route_name ?? '—'}</td>
              <td>{r.replicability ?? '—'}</td>
              <td className="subtle" style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.why_or_reason ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function SourceVolumeTab() {
  const [rows, setRows] = useState<SourceVolumeRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { insp.sourceVolume(12).then(setRows).catch(e => setError(e.message)); }, []);
  const weeks = rows[0]?.weekly_counts.map(w => w.week_start) ?? [];
  return (
    <section className="panel">
      <h2>Source volume — last 12 weeks</h2>
      {error && <div className="panel" style={{ background: '#fee' }}>{error}</div>}
      <table style={{ width: '100%', marginTop: 8 }}>
        <thead><tr>
          <th align="left">Source</th>
          {weeks.map(w => <th key={w} align="right">{w.slice(5)}</th>)}
          <th align="right">Save rate</th>
        </tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.source_channel}>
              <td>{r.source_channel}</td>
              {r.weekly_counts.map(w => <td key={w.week_start} align="right">{w.count}</td>)}
              <td align="right" style={{ color: (r.save_rate ?? 1) < 0.1 ? '#f44336' : undefined }}>
                {r.save_rate != null ? `${(r.save_rate * 100).toFixed(1)}%` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function RouteCoverageTab() {
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState('');
  const [rows, setRows] = useState<RouteCoverageRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    insp.listProducts().then(ps => { setProducts(ps); if (ps[0]) setProductId(ps[0].id); }).catch(e => setError(e.message));
  }, []);
  useEffect(() => {
    if (!productId) return;
    insp.routeCoverage(productId).then(setRows).catch(e => setError(e.message));
  }, [productId]);
  return (
    <section className="panel">
      <h2>Route coverage</h2>
      <label>Product:&nbsp;
        <select value={productId} onChange={e => setProductId(e.target.value)}>
          {products.map(p => <option key={p.id} value={p.id}>{p.brand} — {p.name}</option>)}
        </select>
      </label>
      {error && <div className="panel" style={{ background: '#fee' }}>{error}</div>}
      <table style={{ width: '100%', marginTop: 8 }}>
        <thead><tr>
          <th align="left">Route</th><th align="right">Total saved</th>
          <th align="right">7d</th><th align="right">30d</th><th />
        </tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.route_id} style={{ background: r.is_under_served ? '#fff4f4' : undefined }}>
              <td>{r.route_name}</td>
              <td align="right">{r.total_saved}</td>
              <td align="right">{r.saved_last_7d}</td>
              <td align="right">{r.saved_last_30d}</td>
              <td style={{ color: '#f44336' }}>{r.is_under_served ? 'under-served' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
