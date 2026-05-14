'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api, fmtMoney, fmtNum, fmtPct } from '../lib/api';

type Detail = any;

// Fields we surface in the side-by-side row. The boolean flag marks differences.
const COMPARE_ROWS: Array<{ label: string; path: (d: Detail) => any; format?: (v: any) => string }> = [
  { label: 'SKU', path: (d) => d.autotag?.sku },
  { label: 'Format', path: (d) => d.autotag?.format },
  { label: 'Hook archetype', path: (d) => d.autotag?.hook_archetype },
  { label: 'Hook mechanic', path: (d) => d.autotag?.hook_mechanic },
  { label: 'Opening subject', path: (d) => d.autotag?.opening_subject },
  { label: 'On-screen text', path: (d) => d.autotag?.on_screen_text },
  { label: 'Audio type', path: (d) => d.autotag?.audio_type },
  { label: 'Audio language', path: (d) => d.autotag?.audio_language },
  { label: 'Persona', path: (d) => d.autotag?.persona_implied },
  { label: 'Pain addressed', path: (d) => d.autotag?.pain_addressed },
  { label: 'Awareness stage', path: (d) => d.autotag?.awareness_stage },
  { label: 'Angle', path: (d) => d.autotag?.angle },
  { label: 'Brand visible <3s', path: (d) => d.autotag?.brand_visible_first_3s, format: (v) => v === null || v === undefined ? '—' : v ? 'Yes' : 'No' },
  { label: 'Product reveal', path: (d) => d.autotag?.product_reveal_second, format: (v) => v !== null && v !== undefined ? `${(v as number).toFixed(1)}s` : '—' },
  { label: 'Follows 60% rule', path: (d) => d.autotag?.follows_60pct_rule, format: (v) => v === null || v === undefined ? '—' : v ? 'Yes' : 'No' },
  { label: 'Talent', path: (d) => d.autotag?.talent_type },
  { label: 'Setting', path: (d) => d.autotag?.setting },
  { label: 'Duration', path: (d) => d.actual_duration_seconds, format: (v) => v ? `${(v as number).toFixed(1)}s` : '—' },
  { label: 'Spend', path: (d) => d.performance_aggregate?.spend, format: fmtMoney },
  { label: 'ROAS', path: (d) => d.performance_aggregate?.roas, format: fmtNum },
  { label: 'Hook rate', path: (d) => d.performance_aggregate?.hook_rate, format: fmtPct },
  { label: 'Hold rate', path: (d) => d.performance_aggregate?.hold_rate, format: fmtPct },
  { label: 'CTR', path: (d) => d.performance_aggregate?.ctr, format: (v) => fmtPct(v, 2) },
];

export default function ComparePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const idsStr = searchParams.get('ids') ?? '';
  const ids = idsStr.split(',').filter(Boolean);

  const [details, setDetails] = useState<Detail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [syncPlay, setSyncPlay] = useState(true);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);

  useEffect(() => {
    setLoading(true);
    Promise.all(ids.map((id) => api.getAsset(id).catch(() => null)))
      .then((res) => { setDetails(res.filter(Boolean)); })
      .catch((e: any) => setError(e.message ?? String(e)))
      .finally(() => setLoading(false));
  }, [idsStr]);

  function syncedPlay() {
    if (!syncPlay) return;
    videoRefs.current.forEach((v) => {
      if (v) { v.currentTime = 0; v.play().catch(() => {}); }
    });
  }
  function syncedPause() {
    videoRefs.current.forEach((v) => v?.pause());
  }

  if (ids.length < 2) {
    return (
      <div className="panel">
        <div className="empty">
          <span className="empty-icon">⊕</span>
          <div className="empty-title">Select at least 2 creatives</div>
          <div className="empty-hint">Go to the <a href="/">Library</a>, check 2-4 cards, then click "Compare →".</div>
        </div>
      </div>
    );
  }
  if (loading) {
    return (
      <div>
        <div className="toolbar"><h1 className="page-title">Comparing…</h1><span className="dot-spinner" /></div>
        <div className="panel"><div style={{ display: 'grid', gridTemplateColumns: `repeat(${ids.length}, 1fr)`, gap: 16 }}>
          {ids.map((id) => <div key={id} className="skeleton" style={{ aspectRatio: '9 / 16', borderRadius: 8 }} />)}
        </div></div>
      </div>
    );
  }
  if (error) return <div className="panel" style={{ color: 'var(--danger)' }}>Error: {error}</div>;
  if (details.length < ids.length) {
    return (
      <div className="panel" style={{ color: 'var(--warn)' }}>
        Only {details.length} of {ids.length} requested creatives could be loaded. The rest may have been deleted.
      </div>
    );
  }

  return (
    <div>
      <div className="toolbar">
        <Link href="/" className="btn secondary">← Library</Link>
        <h1 className="page-title">Comparing {details.length} creatives</h1>
        <label className="subtle" style={{ marginLeft: 'auto' }}>
          <input type="checkbox" checked={syncPlay} onChange={(e) => setSyncPlay(e.target.checked)} /> sync-play
        </label>
        <button className="btn secondary" onClick={syncedPlay}>▶ Play all</button>
        <button className="btn secondary" onClick={syncedPause}>⏸ Pause all</button>
      </div>

      {/* Video row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${details.length}, 1fr)`,
        gap: 16,
        marginBottom: 16,
      }}>
        {details.map((d, i) => {
          const ratio = d.actual_width && d.actual_height ? d.actual_width / d.actual_height : 9/16;
          const aspect = ratio < 0.7 ? '9 / 16' : ratio < 0.95 ? '4 / 5' : ratio < 1.15 ? '1 / 1' : '16 / 9';
          return (
            <div key={d.asset_id} className="panel" style={{ padding: 8 }}>
              <div style={{ position: 'relative', background: '#000', borderRadius: 6, aspectRatio: aspect, overflow: 'hidden' }}>
                {d.asset_type === 'image' ? (
                  <img src={`/media/${d.asset_id}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : (
                  <video
                    ref={(el) => { videoRefs.current[i] = el; }}
                    src={`/media/${d.asset_id}`}
                    controls
                    preload="metadata"
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                )}
              </div>
              <div style={{ marginTop: 8 }}>
                <Link href={`/asset/${d.asset_id}`} style={{ fontSize: 12, color: 'var(--accent)' }}>{d.ad_references?.[0]?.ad_name ?? d.asset_id} →</Link>
              </div>
            </div>
          );
        })}
      </div>

      {/* Side-by-side tag/performance rows. Differences are highlighted. */}
      <div className="panel" style={{ padding: 0 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Attribute</th>
              {details.map((d) => <th key={d.asset_id}>{d.ad_references?.[0]?.ad_name ?? d.asset_id}</th>)}
            </tr>
          </thead>
          <tbody>
            {COMPARE_ROWS.map((row, ri) => {
              const values = details.map((d) => row.path(d));
              const formatted = values.map((v) => row.format ? row.format(v) : (v ?? '—'));
              const allSame = values.every((v) => v === values[0]);
              return (
                <tr key={ri}>
                  <td style={{ color: 'var(--text-dim)' }}>{row.label}</td>
                  {formatted.map((v, i) => (
                    <td key={i} style={{
                      fontWeight: !allSame ? 700 : 400,
                      color: !allSame ? 'var(--accent)' : 'var(--text)',
                    }}>{String(v)}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Diagnostic notes */}
      <div className="panel">
        <h2>Diagnostic notes</h2>
        <textarea
          placeholder="Why did one outperform the others?"
          value={notes.text ?? ''}
          onChange={(e) => setNotes({ ...notes, text: e.target.value })}
          style={{ width: '100%', minHeight: 100, padding: 10, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 4 }}
        />
        <div className="subtle" style={{ fontSize: 11, marginTop: 6 }}>Notes are local — not saved between sessions yet.</div>
      </div>
    </div>
  );
}
