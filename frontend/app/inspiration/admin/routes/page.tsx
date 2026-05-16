'use client';
import { useEffect, useState } from 'react';
import InspirationNav from '../../components/InspirationNav';
import { insp, Product, Route } from '../../lib/api';

export default function RoutesAdmin() {
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState<string>('');
  const [routes, setRoutes] = useState<Route[]>([]);
  const [editing, setEditing] = useState<Route | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Route>>({});

  useEffect(() => {
    insp.listProducts(false).then(ps => {
      setProducts(ps);
      if (ps[0]) setProductId(ps[0].id);
    }).catch(e => setError(e.message));
  }, []);

  useEffect(() => {
    if (!productId) return;
    insp.listRoutes(productId).then(setRoutes).catch(e => setError(e.message));
  }, [productId]);

  function startEdit(r: Route) { setEditing(r); setCreating(false); setForm(r); }
  function startCreate() { setCreating(true); setEditing(null); setForm({ product_id: productId, name: '' }); }

  async function submit() {
    try {
      if (editing) {
        await insp.updateRoute(editing.id, { ...form, product_id: productId });
      } else {
        await insp.createRoute({ ...form, product_id: productId });
      }
      setEditing(null); setCreating(false); setForm({});
      setRoutes(await insp.listRoutes(productId));
    } catch (e: any) { setError(e.message); }
  }

  return (
    <main style={{ maxWidth: 960 }}>
      <InspirationNav />
      <section className="panel">
        <h1>Routes</h1>
        <p className="subtle">
          Per US-1.2: routes are versioned (edits preserve previous versions),
          archive-not-delete once referenced, and route quality is the leverage
          point — invest in <code>design_tone</code> and <code>hard_no_list</code>.
        </p>

        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 16 }}>
          <label>
            Product:&nbsp;
            <select value={productId} onChange={e => setProductId(e.target.value)}>
              {products.map(p => <option key={p.id} value={p.id}>{p.brand} — {p.name}</option>)}
            </select>
          </label>
          <button onClick={startCreate}>+ New route</button>
        </div>

        {error && <div className="panel" style={{ background: '#fee', marginTop: 12 }}>{error}</div>}

        {(creating || editing) && (
          <div className="panel" style={{ marginTop: 16, background: '#f7f7f7' }}>
            <h3>{editing ? `Edit ${editing.name} (v${editing.version})` : 'New route'}</h3>
            <div style={{ display: 'grid', gap: 8 }}>
              <label>Name<input value={form.name ?? ''} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
              <label>Design tone<textarea rows={4} value={form.design_tone ?? ''} onChange={e => setForm({ ...form, design_tone: e.target.value })} /></label>
              <label>Hard-no list (comma-separated)
                <input
                  value={(form.hard_no_list ?? []).join(', ')}
                  onChange={e => setForm({ ...form, hard_no_list: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                />
              </label>
              <label>Static format notes<textarea rows={2} value={form.static_format_notes ?? ''} onChange={e => setForm({ ...form, static_format_notes: e.target.value })} /></label>
              <label>GIF format notes<textarea rows={2} value={form.gif_format_notes ?? ''} onChange={e => setForm({ ...form, gif_format_notes: e.target.value })} /></label>
              <label>Video format notes<textarea rows={2} value={form.video_format_notes ?? ''} onChange={e => setForm({ ...form, video_format_notes: e.target.value })} /></label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={submit}>{editing ? 'Save new version' : 'Create'}</button>
                <button onClick={() => { setEditing(null); setCreating(false); }}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        <table style={{ width: '100%', marginTop: 16 }}>
          <thead><tr><th align="left">Route</th><th align="left">Version</th><th align="left">Hard-no</th><th /></tr></thead>
          <tbody>
            {routes.map(r => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>v{r.version}</td>
                <td className="subtle">{(r.hard_no_list ?? []).slice(0, 3).join(', ')}{(r.hard_no_list?.length ?? 0) > 3 ? '…' : ''}</td>
                <td><button onClick={() => startEdit(r)}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
