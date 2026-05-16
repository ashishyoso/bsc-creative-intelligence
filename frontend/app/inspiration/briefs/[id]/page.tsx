'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import InspirationNav from '../../components/InspirationNav';
import { BriefDetail, insp, Reference } from '../../lib/api';

export default function BriefDetailPage() {
  const params = useParams<{ id: string }>();
  const [brief, setBrief] = useState<BriefDetail | null>(null);
  const [picker, setPicker] = useState<Reference[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setBrief(await insp.getBrief(params.id));
    } catch (e: any) { setError(e.message); }
  }, [params.id]);
  useEffect(() => { load(); }, [load]);

  async function openPicker() {
    if (!brief) return;
    setError(null);
    try {
      const refs = await insp.listReferences({
        product_id: brief.product_id,
        route_id: brief.route_id,
        limit: 200,
      });
      // Exclude already-attached
      const attached = new Set(brief.references.map(r => r.decision_id));
      setPicker(refs.filter(r => !attached.has(r.decision_id)));
      setPickerOpen(true);
    } catch (e: any) { setError(e.message); }
  }

  async function attach(refId: string) {
    if (!brief) return;
    setBusy(true);
    try {
      await insp.attachReference(brief.id, { decision_id: refId, position: brief.references.length });
      setPickerOpen(false);
      await load();
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function detach(refId: string) {
    if (!brief) return;
    if (!confirm('Remove this reference from the brief?')) return;
    setBusy(true);
    try {
      await insp.detachReference(brief.id, refId);
      await load();
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function approve() {
    if (!brief) return;
    setBusy(true); setError(null);
    try {
      await insp.approveBrief(brief.id);
      await load();
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  }

  if (!brief) return <main className="panel">Loading…</main>;

  const canApprove = brief.status === 'draft' && brief.references.length >= 2;

  return (
    <main style={{ maxWidth: 960 }}>
      <InspirationNav />

      <section className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ marginBottom: 4 }}>{brief.title}</h1>
            <p className="subtle">{brief.product_name} · {brief.route_name}</p>
          </div>
          <span style={{ padding: '4px 10px', borderRadius: 3, background: brief.status === 'approved' ? '#1b5e20' : '#37474f', color: 'white' }}>
            {brief.status}
          </span>
        </div>

        {brief.external_doc_url && (
          <p style={{ marginTop: 12 }}><strong>Brief doc:</strong> <a href={brief.external_doc_url} target="_blank" rel="noopener">{brief.external_doc_url}</a></p>
        )}
        {brief.goal && (<><h3>Goal</h3><p>{brief.goal}</p></>)}
        {brief.notes && (<><h3>Notes</h3><p style={{ whiteSpace: 'pre-wrap' }}>{brief.notes}</p></>)}

        {error && <div className="panel" style={{ background: '#fee', color: '#900' }}>{error}</div>}

        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>References ({brief.references.length})</h2>
          {brief.status === 'draft' && <button onClick={openPicker}>+ Attach reference</button>}
        </div>
        <p className="subtle" style={{ fontSize: 13 }}>
          Per US-6.1, approval requires ≥2 references attached from this route board.
        </p>

        {brief.references.length === 0 ? (
          <p className="subtle" style={{ marginTop: 12 }}>No references attached yet.</p>
        ) : (
          <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            {brief.references.map(r => (
              <div key={r.decision_id} className="panel" style={{ padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <Link href={`/inspiration/reference/${r.decision_id}`}>
                    <strong>{r.video.brand}</strong> — {r.video.headline ?? r.video.title ?? '(no headline)'}
                  </Link>
                  <div className="subtle" style={{ fontSize: 13, marginTop: 4 }}>{r.why_text.slice(0, 160)}{r.why_text.length > 160 ? '…' : ''}</div>
                  <div className="subtle" style={{ fontSize: 12, marginTop: 4 }}>{r.replicability} · saved by {r.saved_by_name ?? 'Anonymous'}</div>
                </div>
                {brief.status === 'draft' && <button onClick={() => detach(r.decision_id)} disabled={busy}>Remove</button>}
              </div>
            ))}
          </div>
        )}

        {brief.status === 'draft' && (
          <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={approve} disabled={!canApprove || busy} title={canApprove ? '' : 'Need ≥2 references from this route'} style={{ background: canApprove ? '#4caf50' : undefined, color: canApprove ? 'white' : undefined }}>
              {busy ? 'Working…' : 'Approve for production'}
            </button>
          </div>
        )}
      </section>

      {pickerOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="panel" style={{ width: 720, maxWidth: '95vw', maxHeight: '85vh', overflow: 'auto' }}>
            <h2>Attach reference from {brief.route_name}</h2>
            <p className="subtle">Showing all saved references on this route. Click to attach.</p>
            {picker.length === 0 ? (
              <p className="subtle" style={{ marginTop: 12 }}>No more references available on this route board.</p>
            ) : (
              <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                {picker.map(r => (
                  <button key={r.decision_id} onClick={() => attach(r.decision_id)} disabled={busy} style={{ textAlign: 'left', padding: 12 }}>
                    <strong>{r.video.brand}</strong> — {r.video.headline ?? r.video.title ?? '(no headline)'}<br />
                    <span className="subtle" style={{ fontSize: 13 }}>{r.replicability} · {r.why_text.slice(0, 120)}</span>
                  </button>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <button onClick={() => setPickerOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
