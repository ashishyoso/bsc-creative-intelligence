'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import InspirationNav from '../../components/InspirationNav';
import { insp, Product } from '../../lib/api';

type Mode = 'single' | 'bulk';

function detectPlatform(url: string): string | undefined {
  if (/youtube\.com|youtu\.be/.test(url)) return 'youtube';
  if (/instagram\.com\/(?:reel|p)/.test(url)) return 'instagram_reel';
  if (/tiktok\.com/.test(url)) return 'tiktok';
  if (/vimeo\.com/.test(url)) return 'vimeo';
  if (/facebook\.com\/ads\/library/.test(url)) return 'meta_ad_library';
  return undefined;
}

// US-2.7 — Manual override. Hand-feed videos by URL before automated
// ingest is wired up. All entries land in the queue at the top (FIFO).
export default function ManualAddPage() {
  const [mode, setMode] = useState<Mode>('single');
  const [products, setProducts] = useState<Product[]>([]);
  const [url, setUrl] = useState('');
  const [brand, setBrand] = useState('');
  const [headline, setHeadline] = useState('');
  const [originalPlatform, setOriginalPlatform] = useState('');
  const [productIds, setProductIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<Array<{ id: string; brand: string; url: string; at: string }>>([]);

  // Bulk paste state
  const [bulkText, setBulkText] = useState('');
  const [bulkBrand, setBulkBrand] = useState('');
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number; errors: string[] } | null>(null);

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

  async function bulkSubmit() {
    const lines = bulkText.split('\n').map(l => l.trim()).filter(l => l && /https?:\/\//i.test(l));
    if (!lines.length) { setError('Paste at least one URL (one per line)'); return; }
    if (!bulkBrand.trim()) { setError('Brand required for bulk paste — all entries get the same brand'); return; }
    setSubmitting(true);
    setError(null);
    setBulkProgress({ done: 0, total: lines.length, errors: [] });
    const errors: string[] = [];
    let done = 0;
    for (const u of lines) {
      try {
        const v = await insp.addManualVideo({
          url: u,
          brand: bulkBrand.trim(),
          original_platform: detectPlatform(u),
          product_ids: productIds.length ? productIds : undefined,
        });
        setRecent(prev => [
          { id: v.id, brand: v.brand, url: v.video_url, at: new Date().toLocaleTimeString() },
          ...prev,
        ].slice(0, 20));
      } catch (e: any) {
        errors.push(`${u}: ${e?.message ?? String(e)}`);
      }
      done += 1;
      setBulkProgress({ done, total: lines.length, errors });
    }
    setSubmitting(false);
    if (errors.length === 0) {
      setBulkText('');
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

        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button onClick={() => setMode('single')} className={mode === 'single' ? 'nav-active' : ''}>Single</button>
          <button onClick={() => setMode('bulk')} className={mode === 'bulk' ? 'nav-active' : ''}>Bulk paste</button>
        </div>

        {mode === 'bulk' ? (
          <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
            <label>Brand *
              <input
                value={bulkBrand}
                onChange={e => setBulkBrand(e.target.value)}
                placeholder="All pasted URLs get this brand"
                style={{ width: '100%' }}
              />
            </label>
            <label>URLs (one per line) *
              <textarea
                value={bulkText}
                onChange={e => setBulkText(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=…
https://www.instagram.com/reel/…
https://vimeo.com/…"
                rows={10}
                style={{ width: '100%', fontFamily: 'monospace', fontSize: 13 }}
              />
              <span className="subtle">{bulkText.split('\n').filter(l => l.trim().match(/https?:\/\//i)).length} URLs detected</span>
            </label>
            <label>Associated products (optional, applies to all)
              <select
                multiple
                value={productIds}
                onChange={e => setProductIds(Array.from(e.target.selectedOptions).map(o => o.value))}
                size={Math.min(Math.max(products.length, 3), 6)}
              >
                {products.map(p => <option key={p.id} value={p.id}>{p.brand} — {p.name}</option>)}
              </select>
            </label>

            {bulkProgress && (
              <div className="panel" style={{ background: '#1a1a1a' }}>
                Progress: {bulkProgress.done} / {bulkProgress.total}
                {bulkProgress.errors.length > 0 && (
                  <div style={{ color: '#f44336', marginTop: 8 }}>
                    {bulkProgress.errors.length} errors:
                    <ul>{bulkProgress.errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}</ul>
                  </div>
                )}
              </div>
            )}

            {error && <div className="panel" style={{ background: '#fee', color: '#900' }}>{error}</div>}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={bulkSubmit} disabled={submitting} style={{ background: '#4caf50', color: 'white' }}>
                {submitting ? `Adding ${bulkProgress?.done ?? 0}/${bulkProgress?.total ?? 0}…` : 'Add all to queue'}
              </button>
            </div>
          </div>
        ) : (
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
        )}

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
