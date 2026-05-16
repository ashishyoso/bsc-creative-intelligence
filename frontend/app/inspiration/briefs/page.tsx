'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import InspirationNav from '../components/InspirationNav';
import { Brief, BriefStatus, insp, Product, Route } from '../lib/api';

export default function BriefsListPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState('');
  const [routes, setRoutes] = useState<Route[]>([]);
  const [routeId, setRouteId] = useState('');
  const [status, setStatus] = useState<BriefStatus | ''>('');
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { insp.listProducts().then(setProducts).catch(e => setError(e.message)); }, []);
  useEffect(() => {
    if (!productId) { setRoutes([]); setRouteId(''); return; }
    insp.listRoutes(productId).then(setRoutes).catch(e => setError(e.message));
  }, [productId]);

  async function reload() {
    try {
      setBriefs(await insp.listBriefs({
        product_id: productId || undefined,
        route_id: routeId || undefined,
        status: status || undefined,
      }));
    } catch (e: any) { setError(e.message); }
  }
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [productId, routeId, status]);

  return (
    <main style={{ maxWidth: 1100 }}>
      <InspirationNav />
      <section className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1>Briefs</h1>
          <Link href="/inspiration/briefs/new"><button>+ New brief</button></Link>
        </div>
        <p className="subtle">
          Epic 6 — light brief manifests. Each brief targets a (product × route) and must attach ≥2
          saved references from that route board before it can be approved (US-6.1, the forcing function).
        </p>

        <div style={{ display: 'flex', gap: 12, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <label>Product:&nbsp;
            <select value={productId} onChange={e => { setProductId(e.target.value); setRouteId(''); }}>
              <option value="">all</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.brand} — {p.name}</option>)}
            </select>
          </label>
          <label>Route:&nbsp;
            <select value={routeId} onChange={e => setRouteId(e.target.value)} disabled={!productId}>
              <option value="">all</option>
              {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <label>Status:&nbsp;
            <select value={status} onChange={e => setStatus(e.target.value as BriefStatus | '')}>
              <option value="">all</option>
              <option value="draft">draft</option>
              <option value="approved">approved</option>
            </select>
          </label>
        </div>

        {error && <div className="panel" style={{ background: '#fee' }}>{error}</div>}

        <table style={{ width: '100%', marginTop: 16 }}>
          <thead><tr>
            <th align="left">Title</th>
            <th align="left">Product</th>
            <th align="left">Route</th>
            <th align="right">Refs</th>
            <th align="left">Status</th>
            <th align="left">Created</th>
          </tr></thead>
          <tbody>
            {briefs.map(b => (
              <tr key={b.id}>
                <td><Link href={`/inspiration/briefs/${b.id}`}>{b.title}</Link></td>
                <td className="subtle">{b.product_name}</td>
                <td className="subtle">{b.route_name}</td>
                <td align="right" style={{ color: b.reference_count < 2 ? '#f44336' : '#4caf50' }}>{b.reference_count}</td>
                <td>
                  <span style={{ padding: '2px 6px', borderRadius: 3, background: b.status === 'approved' ? '#1b5e20' : '#37474f', color: 'white' }}>
                    {b.status}
                  </span>
                </td>
                <td className="subtle">{new Date(b.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {briefs.length === 0 && <tr><td colSpan={6} className="subtle" style={{ textAlign: 'center', padding: 24 }}>No briefs yet.</td></tr>}
          </tbody>
        </table>
      </section>
    </main>
  );
}
