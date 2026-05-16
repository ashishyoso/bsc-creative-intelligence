'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import InspirationNav from '../components/InspirationNav';
import { insp, Product, Route, RouteCoverageRow } from '../lib/api';

// Product × Route picker that leads into the route board view (US-5.1).
export default function LibraryHub() {
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState('');
  const [routes, setRoutes] = useState<Route[]>([]);
  const [coverage, setCoverage] = useState<RouteCoverageRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    insp.listProducts().then(ps => {
      setProducts(ps);
      if (ps[0]) setProductId(ps[0].id);
    }).catch(e => setError(e.message));
  }, []);

  useEffect(() => {
    if (!productId) return;
    Promise.all([
      insp.listRoutes(productId),
      insp.routeCoverage(productId),
    ]).then(([rs, cov]) => {
      setRoutes(rs);
      setCoverage(cov);
    }).catch(e => setError(e.message));
  }, [productId]);

  const cov = (rid: string) => coverage.find(c => c.route_id === rid);

  return (
    <main style={{ maxWidth: 1100 }}>
      <InspirationNav />
      <section className="panel">
        <h1>Library</h1>
        <p className="subtle">Saved references by route. Per US-5.1: each card is a curated board for one product × route.</p>
        <label>Product:&nbsp;
          <select value={productId} onChange={e => setProductId(e.target.value)}>
            {products.map(p => <option key={p.id} value={p.id}>{p.brand} — {p.name}</option>)}
          </select>
        </label>
        {error && <div className="panel" style={{ background: '#fee', marginTop: 12 }}>{error}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, marginTop: 16 }}>
          {routes.map(r => {
            const c = cov(r.id);
            return (
              <Link key={r.id} href={`/inspiration/library/${productId}/${r.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="panel" style={{ padding: 16, borderLeft: c?.is_under_served ? '4px solid #f44336' : '4px solid #4caf50' }}>
                  <div style={{ fontWeight: 600 }}>{r.name}</div>
                  <div className="subtle" style={{ marginTop: 6 }}>
                    {c ? `${c.total_saved} saved · ${c.saved_last_7d} this week` : '—'}
                  </div>
                  {c?.is_under_served && <div style={{ color: '#f44336', marginTop: 4 }}>Under-served (&lt;5)</div>}
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}
