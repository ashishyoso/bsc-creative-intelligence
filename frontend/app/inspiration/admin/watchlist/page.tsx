'use client';
import { useEffect, useState } from 'react';
import InspirationNav from '../../components/InspirationNav';
import { insp, Product, Priority, SourceChannel, Watchlist } from '../../lib/api';

const CHANNELS: SourceChannel[] = ['meta_ad_library', 'meta_marketing', 'youtube', 'tiktok', 'brand_site', 'manual'];

export default function WatchlistAdmin() {
  const [entries, setEntries] = useState<Watchlist[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [filterChannel, setFilterChannel] = useState<SourceChannel | ''>('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<Partial<Watchlist>>({ source_channel: 'meta_ad_library', priority: 'medium', product_ids: [] });
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setEntries(await insp.listWatchlist(filterChannel || undefined, true));
    } catch (e: any) { setError(e.message); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filterChannel]);
  useEffect(() => { insp.listProducts().then(setProducts).catch(e => setError(e.message)); }, []);

  async function create() {
    try {
      await insp.addWatchlist(form);
      setCreating(false);
      setForm({ source_channel: 'meta_ad_library', priority: 'medium', product_ids: [] });
      load();
    } catch (e: any) { setError(e.message); }
  }

  async function remove(id: string) {
    if (!confirm('Deactivate this watchlist entry?')) return;
    try { await insp.removeWatchlist(id); load(); } catch (e: any) { setError(e.message); }
  }

  return (
    <main style={{ maxWidth: 1100 }}>
      <InspirationNav />
      <section className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1>Watchlist</h1>
          <button onClick={() => setCreating(true)}>+ New entry</button>
        </div>
        <p className="subtle">
          Per-source watchlist. A brand may appear in multiple sources — each
          is a separate entry (US-1.3).
        </p>

        <div style={{ marginTop: 12 }}>
          <label>Filter source:&nbsp;
            <select value={filterChannel} onChange={e => setFilterChannel(e.target.value as any)}>
              <option value="">All</option>
              {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        </div>

        {error && <div className="panel" style={{ background: '#fee', marginTop: 12 }}>{error}</div>}

        {creating && (
          <div className="panel" style={{ marginTop: 16, background: '#f7f7f7' }}>
            <h3>New watchlist entry</h3>
            <div style={{ display: 'grid', gap: 8 }}>
              <label>Source channel
                <select value={form.source_channel} onChange={e => setForm({ ...form, source_channel: e.target.value as SourceChannel })}>
                  {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label>Brand<input value={form.brand ?? ''} onChange={e => setForm({ ...form, brand: e.target.value })} /></label>
              <label>Source ID (page_id / channel_id / handle / URL)
                <input value={form.source_external_id ?? ''} onChange={e => setForm({ ...form, source_external_id: e.target.value })} />
              </label>
              <label>Priority
                <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value as Priority })}>
                  <option value="high">high</option>
                  <option value="medium">medium</option>
                  <option value="low">low</option>
                </select>
              </label>
              <label>Associated products
                <select
                  multiple
                  value={form.product_ids ?? []}
                  onChange={e => setForm({ ...form, product_ids: Array.from(e.target.selectedOptions).map(o => o.value) })}
                >
                  {products.map(p => <option key={p.id} value={p.id}>{p.brand} — {p.name}</option>)}
                </select>
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={create}>Create</button>
                <button onClick={() => setCreating(false)}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        <table style={{ width: '100%', marginTop: 16 }}>
          <thead><tr>
            <th align="left">Source</th><th align="left">Brand</th>
            <th align="left">External ID</th><th align="left">Priority</th>
            <th align="left">Active</th><th />
          </tr></thead>
          <tbody>
            {entries.map(e => (
              <tr key={e.id}>
                <td>{e.source_channel}</td>
                <td>{e.brand}</td>
                <td className="subtle"><code>{e.source_external_id ?? '—'}</code></td>
                <td>{e.priority}</td>
                <td>{e.is_active ? '✓' : '—'}</td>
                <td>{e.is_active && <button onClick={() => remove(e.id)}>Deactivate</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
