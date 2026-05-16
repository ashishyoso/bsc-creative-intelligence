'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import InspirationNav from '../../components/InspirationNav';
import { insp, Product } from '../../lib/api';

// US-2.7 — Manual override. Hand-feed videos by URL before automated
// ingest is wired up. All entries land in the queue at the top (FIFO).
export default function ManualAddPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [url, setUrl] = useState('');
  const [brand, setBrand] = useState('');
  const [headline, setHeadline] = useState('');
  const [originalPlatform, setOriginalPlatform] = useState('');
  const [productIds, setProductIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<Array<{ id: string; brand: string; url: string; at: string }>>([]);

  useEffect(() => {
    insp.listProducts().then(setProducts).catch(e => setError(e.message));
  }, []);

  const canSubmit = url.trim() && brand.trim() && !submitting;

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const v = await insp.addManualVideo({
        url: url.trim(),
        brand: brand.trim(),
        headline: headline.trim() || undefined,
        original_platform: originalPlatform.trim() || undefined,
        product_ids: productIds.length ? productIds : undefined,
      });
      setRecent(prev => [
        { id: v.id, brand: v.brand, url: v.video_url, at: new Date().toLocaleTimeString() },
        ...prev,
      ].slice(0, 10));
      setUrl('');
      setHeadline('');
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={{ maxWidth: 720 }}>
      <InspirationNav />

      <section className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h1>Add video manually</h1>
          <Link href="/inspiration/queue" className="subtle">Open queue →</Link>
        </div>
        <p className="subtle">
          US-2.7 — paste a YouTube / Reels / TikTok / direct video URL. Entry lands at the top of the
          pending queue immediately. Use this before automated ingest is live, or for one-off references
          editors should review.
        </p>

        <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
          <label>Video URL *
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=… or https://www.instagram.com/reel/… or .mp4"
              style={{ width: '100%' }}
            />
          </label>

          <label>Brand *
            <input
              value={brand}
              onChange={e => setBrand(e.target.value)}
              placeholder="Manscaped, Meridian, Bombay Shaving Company, …"
              style={{ width: '100%' }}
            />
          </label>

          <label>Headline / caption (optional)
            <input
              value={headline}
              onChange={e => setHeadline(e.target.value)}
              placeholder="What's the hook? Helps editors classify faster."
              style={{ width: '100%' }}
            />
          </label>

          <label>Original platform (optional)
            <select
              value={originalPlatform}
              onChange={e => setOriginalPlatform(e.target.value)}
            >
              <option value="">— pick one —</option>
              <option value="youtube">YouTube</option>
              <option value="instagram_reel">Instagram Reel</option>
              <option value="tiktok">TikTok</option>
              <option value="meta_ad_library">Meta Ad Library</option>
              <option value="brand_site">Brand site</option>
              <option value="other">Other</option>
            </select>
          </label>

          <label>Associated products (optional)
            <select
              multiple
              value={productIds}
              onChange={e => setProductIds(Array.from(e.target.selectedOptions).map(o => o.value))}
              size={Math.min(Math.max(products.length, 3), 6)}
            >
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.brand} — {p.name}</option>
              ))}
            </select>
            <span className="subtle">Hold ⌘ / Ctrl to pick multiple. Used for cross-product saves at decision time.</span>
          </label>

          {error && <div className="panel" style={{ background: '#fee', color: '#900' }}>{error}</div>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={submit} disabled={!canSubmit} style={{ background: '#4caf50', color: 'white' }}>
              {submitting ? 'Adding…' : 'Add to queue'}
            </button>
          </div>
        </div>

        {recent.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <h3>Added this session</h3>
            <table style={{ width: '100%' }}>
              <thead><tr><th align="left">When</th><th align="left">Brand</th><th align="left">URL</th></tr></thead>
              <tbody>
                {recent.map(r => (
                  <tr key={r.id}>
                    <td>{r.at}</td>
                    <td>{r.brand}</td>
                    <td className="subtle" style={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      <a href={r.url} target="_blank" rel="noopener">{r.url}</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
