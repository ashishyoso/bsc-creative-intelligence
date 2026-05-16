'use client';
import { useEffect, useState } from 'react';
import InspirationNav from '../../components/InspirationNav';
import { insp, Product } from '../../lib/api';

export default function ProductsAdmin() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<Partial<Product>>({ name: '', brand: 'BSC', description: '', is_active: true });

  async function load() {
    setLoading(true); setError(null);
    try {
      setProducts(await insp.listProducts(true));
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function create() {
    if (!form.name || !form.brand) { setError('name and brand required'); return; }
    try {
      await insp.createProduct(form);
      setForm({ name: '', brand: 'BSC', description: '', is_active: true });
      setCreating(false);
      load();
    } catch (e: any) { setError(e.message); }
  }

  async function toggleActive(p: Product) {
    try {
      await insp.updateProduct(p.id, { ...p, is_active: !p.is_active });
      load();
    } catch (e: any) { setError(e.message); }
  }

  return (
    <main style={{ maxWidth: 960 }}>
      <InspirationNav />
      <section className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1>Products</h1>
          <button onClick={() => setCreating(true)}>+ New product</button>
        </div>
        <p className="subtle">
          A product anchors a route taxonomy. Per spec US-1.1: products cannot
          be hard-deleted once routes or decisions reference them — they are
          set inactive instead.
        </p>

        {error && <div className="panel" style={{ background: '#fee' }}>{error}</div>}

        {creating && (
          <div className="panel" style={{ marginTop: 16, background: '#f7f7f7' }}>
            <h3>New product</h3>
            <div style={{ display: 'grid', gap: 8 }}>
              <label>
                Name
                <input value={form.name ?? ''} onChange={e => setForm({ ...form, name: e.target.value })} />
              </label>
              <label>
                Brand
                <select value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })}>
                  <option>BSC</option>
                  <option>Bombae</option>
                  <option>other</option>
                </select>
              </label>
              <label>
                Description
                <textarea value={form.description ?? ''} onChange={e => setForm({ ...form, description: e.target.value })} />
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={create}>Create</button>
                <button onClick={() => setCreating(false)}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {loading ? <p>Loading…</p> : (
          <table style={{ width: '100%', marginTop: 16 }}>
            <thead><tr><th align="left">Name</th><th align="left">Brand</th><th align="left">Active</th><th /></tr></thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.brand}</td>
                  <td>{p.is_active ? '✓' : '—'}</td>
                  <td>
                    <button onClick={() => toggleActive(p)}>
                      {p.is_active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
