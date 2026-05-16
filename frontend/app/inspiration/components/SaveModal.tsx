'use client';
import { useEffect, useState } from 'react';
import { insp, Product, Replicability, Route, VideoSummary } from '../lib/api';

type Props = {
  video: VideoSummary;
  onSaved: () => void;
  onClose: () => void;
};

// US-3.5 — mandatory tagging modal. The load-bearing UX.
// Required: route, replicability, why_text (≥20 chars).
// Optional: cross-product save (US-3.9) — multi-product selection with own route dropdowns.
export default function SaveModal({ video, onSaved, onClose }: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState('');
  const [routes, setRoutes] = useState<Route[]>([]);
  const [routeId, setRouteId] = useState('');
  const [replicability, setReplicability] = useState<Replicability>('yes');
  const [whyText, setWhyText] = useState('');
  const [crossProducts, setCrossProducts] = useState<Array<{ product_id: string; route_id: string }>>([]);
  const [otherProducts, setOtherProducts] = useState<Product[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    insp.listProducts().then(ps => {
      setProducts(ps);
      if (ps[0]) setProductId(ps[0].id);
    });
  }, []);

  useEffect(() => {
    if (!productId) return;
    insp.listRoutes(productId).then(rs => {
      setRoutes(rs);
      if (rs[0]) setRouteId(rs[0].id);
    });
    setOtherProducts(products.filter(p => p.id !== productId));
  }, [productId, products]);

  const canSubmit = productId && routeId && replicability && whyText.length >= 20 && !submitting;

  async function submit() {
    setSubmitting(true); setError(null);
    try {
      await insp.saveDecision({
        video_id: video.id,
        product_id: productId,
        route_id: routeId,
        replicability,
        why_text: whyText,
        cross_product_saves: crossProducts.filter(c => c.product_id && c.route_id),
      });
      onSaved();
    } catch (e: any) {
      setError(e.message);
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div className="panel" style={{ width: 520, maxWidth: '90vw', maxHeight: '90vh', overflow: 'auto' }}>
        <h2>Save reference</h2>
        <p className="subtle">{video.brand} — {video.headline ?? video.title ?? video.id}</p>

        <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
          <label>Product
            <select value={productId} onChange={e => setProductId(e.target.value)}>
              {products.map(p => <option key={p.id} value={p.id}>{p.brand} — {p.name}</option>)}
            </select>
          </label>

          <label>Route
            <select value={routeId} onChange={e => setRouteId(e.target.value)}>
              {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>

          <label>Replicability
            <select value={replicability} onChange={e => setReplicability(e.target.value as Replicability)}>
              <option value="yes">Yes — current team can replicate confidently</option>
              <option value="stretch">Stretch — current team can attempt with senior oversight</option>
              <option value="no">No — aspirational only, requires external talent</option>
            </select>
          </label>

          <label>Why it works (min 20 chars)
            <textarea
              rows={4}
              value={whyText}
              onChange={e => setWhyText(e.target.value)}
              placeholder="Specifically — hook, structure, casting, sound design, end frame…"
            />
            <span className="subtle">{whyText.length} / 20</span>
          </label>

          {otherProducts.length > 0 && (
            <details>
              <summary>Also save for other products? (US-3.9)</summary>
              <div style={{ marginTop: 8 }}>
                {otherProducts.map(p => (
                  <CrossProductRow
                    key={p.id}
                    product={p}
                    value={crossProducts.find(c => c.product_id === p.id)?.route_id ?? ''}
                    onChange={(rid) => {
                      setCrossProducts(prev => {
                        const others = prev.filter(c => c.product_id !== p.id);
                        return rid ? [...others, { product_id: p.id, route_id: rid }] : others;
                      });
                    }}
                  />
                ))}
              </div>
            </details>
          )}

          {error && <div className="panel" style={{ background: '#fee' }}>{error}</div>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={onClose}>Cancel</button>
            <button onClick={submit} disabled={!canSubmit}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CrossProductRow({ product, value, onChange }: { product: Product; value: string; onChange: (rid: string) => void }) {
  const [routes, setRoutes] = useState<Route[]>([]);
  useEffect(() => { insp.listRoutes(product.id).then(setRoutes); }, [product.id]);
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
      <span style={{ minWidth: 140 }}>{product.brand} — {product.name}</span>
      <select value={value} onChange={e => onChange(e.target.value)}>
        <option value="">— skip —</option>
        {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>
    </div>
  );
}
