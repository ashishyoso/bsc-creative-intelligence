'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import InspirationNav from '../../components/InspirationNav';
import { insp, Reference, ShotBreakdown } from '../../lib/api';

// US-5.2 — reference detail. Permalink target. Editable shot breakdown (US-5.3).
export default function ReferenceDetailPage() {
  const params = useParams<{ id: string }>();
  const [ref, setRef] = useState<Reference | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sb, setSb] = useState<Partial<ShotBreakdown>>({});
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    insp.getReference(params.id).then(r => {
      setRef(r);
      setSb(r.shot_breakdown ?? {});
    }).catch(e => setError(e.message));
  }, [params.id]);

  async function saveSb() {
    setSaving(true);
    try {
      const saved = await insp.upsertShotBreakdown(params.id, sb);
      setSb(saved);
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  function copyLink() {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (error) return <div className="panel" style={{ background: '#fee' }}>{error}</div>;
  if (!ref) return <p>Loading…</p>;

  const v = ref.video;
  const url = v.video_url_cached || v.video_url;

  return (
    <main style={{ maxWidth: 960 }}>
      <InspirationNav />
      <section className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1>{v.brand}</h1>
            <p className="subtle">Saved by {ref.saved_by_name ?? ref.saved_by} on {new Date(ref.saved_at).toLocaleDateString()} · {ref.route_name} · {ref.replicability}</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={copyLink}>{copied ? 'Copied!' : 'Copy permalink'}</button>
            <Link href={`/inspiration/library/${ref.product_id}/${ref.route_id}`}>← Route board</Link>
          </div>
        </div>

        {url && (
          <div style={{ background: '#000', marginTop: 16, display: 'flex', justifyContent: 'center' }}>
            <video src={url} controls style={{ maxWidth: '100%', maxHeight: 600 }} />
          </div>
        )}

        <h2 style={{ marginTop: 24 }}>Why it works</h2>
        <p>{ref.why_text}</p>

        {v.headline && <><h3>Ad copy</h3><p><strong>{v.headline}</strong></p></>}
        {v.cta_text && <p className="subtle">CTA: {v.cta_text}</p>}

        <h2 style={{ marginTop: 24 }}>Shot breakdown (optional, US-5.3)</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label>Shots<input type="number" value={sb.shot_count ?? ''} onChange={e => setSb(s => ({ ...s, shot_count: e.target.value ? Number(e.target.value) : null }))} /></label>
          <label>Camera<select value={sb.camera_type ?? ''} onChange={e => setSb(s => ({ ...s, camera_type: e.target.value || null }))}>
            <option value="">—</option><option>locked</option><option>handheld</option><option>gimbal</option><option>macro</option><option>mixed</option>
          </select></label>
          <label>Lighting<select value={sb.lighting_type ?? ''} onChange={e => setSb(s => ({ ...s, lighting_type: e.target.value || null }))}>
            <option value="">—</option><option>single source</option><option>window-natural</option><option>3-point</option><option>available-light</option><option>other</option>
          </select></label>
          <label>Audio<select value={sb.audio_approach ?? ''} onChange={e => setSb(s => ({ ...s, audio_approach: e.target.value || null }))}>
            <option value="">—</option><option>silence</option><option>ambient</option><option>VO</option><option>music</option><option>SFX-led</option>
          </select></label>
          <label style={{ gridColumn: '1 / -1' }}>Opening hook<textarea rows={2} value={sb.opening_hook ?? ''} onChange={e => setSb(s => ({ ...s, opening_hook: e.target.value || null }))} /></label>
          <label style={{ gridColumn: '1 / -1' }}>End frame<textarea rows={2} value={sb.end_frame ?? ''} onChange={e => setSb(s => ({ ...s, end_frame: e.target.value || null }))} /></label>
        </div>
        <button onClick={saveSb} disabled={saving} style={{ marginTop: 12 }}>{saving ? 'Saving…' : 'Save breakdown'}</button>
      </section>
    </main>
  );
}
