'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import InspirationNav from '../../components/InspirationNav';
import { insp, Product, Route } from '../../lib/api';

export default function NewBriefPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [productId, setProductId] = useState('');
  const [routeId, setRouteId] = useState('');
  const [title, setTitle] = useState('');
  const [externalDocUrl, setExternalDocUrl] = useState('');
  const [goal, setGoal] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    insp.listProducts().then(ps => {
      setProducts(ps);
      if (ps[0]) setProductId(ps[0].id);
    }).catch(e => setError(e.message));
  }, []);

  useEffect(() => {
    if (!productId) return;
    insp.listRoutes(productId).then(rs => {
      setRoutes(rs);
      if (rs[0]) setRouteId(rs[0].id);
    }).catch(e => setError(e.message));
  }, [productId]);

  async function submit() {
    if (!title.trim() || !productId || !routeId) { setError('Title, product, route required'); return; }
    setSubmitting(true); setError(null);
    try {
      const brief = await insp.createBrief({
        product_id: productId,
        route_id: routeId,
        title: title.trim(),
        external_doc_url: externalDocUrl.trim() || undefined,
        goal: goal.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      router.push(`/inspiration/briefs/${brief.id}`);
    } catch (e: any) {
      setError(e.message);
      setSubmitting(false);
    }
  }

  return (
    <main style={{ maxWidth: 720 }}>
      <InspirationNav />
      <section className="panel">
        <h1>New brief</h1>
        <p className="subtle">
          Each brief is anchored to one product × route. After creation you can attach references from
          that route board. Approval is gated on ≥2 references.
        </p>

        <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
          <label>Title *
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. FBT SE Vault — Dec 2026 BOF set" />
          </label>
          <label>Product *
            <select value={productId} onChange={e => setProductId(e.target.value)}>
              {products.map(p => <option key={p.id} value={p.id}>{p.brand} — {p.name}</option>)}
            </select>
          </label>
          <label>Route *
            <select value={routeId} onChange={e => setRouteId(e.target.value)}>
              {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <label>External brief doc URL (optional)
            <input value={externalDocUrl} onChange={e => setExternalDocUrl(e.target.value)} placeholder="https://docs.google.com/… or https://notion.so/…" />
          </label>
          <label>Goal / outcome (optional)
            <textarea rows={2} value={goal} onChange={e => setGoal(e.target.value)} placeholder="What does this brief need to achieve?" />
          </label>
          <label>Notes (optional)
            <textarea rows={4} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any context the editor / producer needs" />
          </label>

          {error && <div className="panel" style={{ background: '#fee', color: '#900' }}>{error}</div>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={submit} disabled={submitting} style={{ background: '#4caf50', color: 'white' }}>
              {submitting ? 'Creating…' : 'Create brief'}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
