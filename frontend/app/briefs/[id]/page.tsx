'use client';
import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, fmtMoney, fmtNum, fmtPct } from '../../lib/api';
import { useToast } from '../../components/Toast';

export default function BriefDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const briefId = Number(id);
  const router = useRouter();
  const toast = useToast();
  const [b, setB] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState<any>(null);

  async function load() {
    try { const d = await api.getBrief(briefId); setB(d); setDraft(d); }
    catch (e: any) { setError(e.message ?? String(e)); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [briefId]);

  async function save() {
    setSaving(true);
    try {
      const patch: any = {};
      if (draft.title !== b.title) patch.title = draft.title;
      if (draft.brief_markdown !== b.brief_markdown) patch.brief_markdown = draft.brief_markdown;
      if (draft.notes !== b.notes) patch.notes = draft.notes;
      if (JSON.stringify(draft.verbal_hooks) !== JSON.stringify(b.verbal_hooks)) patch.verbal_hooks = draft.verbal_hooks;
      if (JSON.stringify(draft.on_screen_hooks) !== JSON.stringify(b.on_screen_hooks)) patch.on_screen_hooks = draft.on_screen_hooks;
      if (draft.mechanic !== b.mechanic) patch.mechanic = draft.mechanic;
      if (draft.music_direction !== b.music_direction) patch.music_direction = draft.music_direction;
      if (draft.talent_direction !== b.talent_direction) patch.talent_direction = draft.talent_direction;
      if (draft.duration_target_seconds !== b.duration_target_seconds) patch.duration_target_seconds = draft.duration_target_seconds;
      const updated = await api.patchBrief(briefId, patch);
      setB(updated); setDraft(updated); setEditMode(false);
      toast.push('Brief saved', 'success');
    } catch (e: any) { setError(e.message ?? String(e)); toast.push('Save failed', 'error'); }
    finally { setSaving(false); }
  }

  async function setStatus(status: string) {
    const updated = await api.patchBrief(briefId, { status });
    setB(updated); setDraft(updated);
    toast.push(`Status → ${status}`, 'success');
  }

  async function del() {
    const ok = await toast.confirm('Delete this brief? This cannot be undone.', { confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    await api.deleteBrief(briefId);
    toast.push('Brief deleted', 'success');
    router.push('/briefs');
  }

  function copyMarkdown() {
    navigator.clipboard.writeText(b.brief_markdown ?? '').then(
      () => toast.push('Markdown copied to clipboard', 'success'),
      () => toast.push('Copy failed', 'error'),
    );
  }

  if (error) return <div className="panel" style={{ color: 'var(--danger)' }}>Error: {error}</div>;
  if (!b) {
    return (
      <div>
        <div className="toolbar"><span className="dot-spinner" /> <span className="subtle">Loading brief…</span></div>
        <div className="panel"><div className="skeleton" style={{ height: 22, width: 240, marginBottom: 16 }} />
          {[...Array(5)].map((_, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 12, marginBottom: 8 }}>
              <div className="skeleton" style={{ height: 11 }} /><div className="skeleton" style={{ height: 11 }} />
            </div>
          ))}
        </div>
        <div className="panel"><div className="skeleton" style={{ height: 12, width: 160, marginBottom: 12 }} />
          {[...Array(3)].map((_, i) => <div key={i} className="skeleton" style={{ height: 12, marginBottom: 6 }} />)}
        </div>
      </div>
    );
  }

  const formula = b.formula_json;

  return (
    <div>
      <div className="toolbar">
        <Link href="/briefs" className="btn secondary">← Briefs</Link>
        {editMode ? (
          <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            style={{ flex: 1, padding: 8, fontSize: 18, fontWeight: 600, background: 'var(--bg-card)', border: '1px solid var(--accent)', color: 'var(--text)', borderRadius: 4 }} />
        ) : (
          <h1 className="page-title" style={{ flex: 1 }}>{b.title}</h1>
        )}
        <span className="confidence" style={{ marginRight: 8 }}>{b.status}</span>
        {editMode ? (
          <>
            <button className="btn" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
            <button className="btn secondary" onClick={() => { setDraft(b); setEditMode(false); }}>Cancel</button>
          </>
        ) : (
          <>
            <button className="btn secondary" onClick={() => setEditMode(true)}>Edit</button>
            <button className="btn secondary" onClick={copyMarkdown}>Copy MD</button>
            <a className="btn secondary" href={`/api/briefs/${briefId}/export.docx`} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>↓ DOCX</a>
            <button className="btn danger" onClick={del}>Delete</button>
          </>
        )}
      </div>

      <div className="panel">
        <h2>Lifecycle</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {['draft', 'briefed', 'shipped', 'performed'].map((s) => (
            <button key={s}
              className={`btn ${b.status === s ? '' : 'secondary'}`}
              onClick={() => setStatus(s)}
              style={{ padding: '6px 14px' }}>{s}</button>
          ))}
        </div>
      </div>

      <div className="panel">
        <h2>Intent</h2>
        <div className="kv" style={{ gridTemplateColumns: '180px 1fr' }}>
          <div className="k">Target SKU</div><div>{b.target_sku}</div>
          <div className="k">Optimizing for</div><div>{b.target_metric}</div>
          <div className="k">Persona</div><div>{b.persona ?? '—'}</div>
          <div className="k">Language</div><div>{b.audio_language ?? '—'}</div>
          <div className="k">Format</div><div>{b.format_constraint ?? '—'}</div>
          <div className="k">Overall confidence</div><div><span className={`confidence ${b.overall_confidence}`}>{b.overall_confidence}</span></div>
          <div className="k">Cohort size</div><div>{b.cohort_size} historical creatives</div>
        </div>
      </div>

      <div className="panel">
        <h2>Verbal hook options</h2>
        {editMode ? (
          (draft.verbal_hooks ?? []).map((h: string, i: number) => (
            <input key={i} value={h} onChange={(e) => {
              const arr = [...draft.verbal_hooks];
              arr[i] = e.target.value;
              setDraft({ ...draft, verbal_hooks: arr });
            }} style={{ width: '100%', padding: 8, margin: '4px 0', background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 4 }} />
          ))
        ) : (
          <ol style={{ paddingLeft: 18, lineHeight: 1.7 }}>
            {(b.verbal_hooks ?? []).map((h: string, i: number) => <li key={i}>{h}</li>)}
          </ol>
        )}
      </div>

      <div className="panel">
        <h2>On-screen text options</h2>
        {editMode ? (
          (draft.on_screen_hooks ?? []).map((h: string, i: number) => (
            <input key={i} value={h} onChange={(e) => {
              const arr = [...draft.on_screen_hooks];
              arr[i] = e.target.value;
              setDraft({ ...draft, on_screen_hooks: arr });
            }} style={{ width: '100%', padding: 8, margin: '4px 0', background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 4 }} />
          ))
        ) : (
          <ol style={{ paddingLeft: 18, lineHeight: 1.7 }}>
            {(b.on_screen_hooks ?? []).map((h: string, i: number) => <li key={i}>{h}</li>)}
          </ol>
        )}
      </div>

      <div className="panel">
        <h2>Production direction</h2>
        <div className="kv" style={{ gridTemplateColumns: '180px 1fr' }}>
          <div className="k">Mechanic</div>
          <div>{editMode ? <input value={draft.mechanic ?? ''} onChange={(e) => setDraft({ ...draft, mechanic: e.target.value })} style={{ width: '100%', padding: 6, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 4 }} /> : (b.mechanic ?? '—')}</div>
          <div className="k">Music</div>
          <div>{editMode ? <input value={draft.music_direction ?? ''} onChange={(e) => setDraft({ ...draft, music_direction: e.target.value })} style={{ width: '100%', padding: 6, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 4 }} /> : (b.music_direction ?? '—')}</div>
          <div className="k">Talent</div>
          <div>{editMode ? <input value={draft.talent_direction ?? ''} onChange={(e) => setDraft({ ...draft, talent_direction: e.target.value })} style={{ width: '100%', padding: 6, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 4 }} /> : (b.talent_direction ?? '—')}</div>
          <div className="k">Duration target</div>
          <div>{editMode ? <input type="number" value={draft.duration_target_seconds ?? 22} onChange={(e) => setDraft({ ...draft, duration_target_seconds: Number(e.target.value) })} style={{ width: 100, padding: 6, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 4 }} /> : `${b.duration_target_seconds ?? '—'}s`}</div>
        </div>
      </div>

      {formula?.recommendations && (
        <div className="panel">
          <h2>Tag manifest (the formula)</h2>
          <table className="table">
            <thead>
              <tr><th>Dimension</th><th>Value</th><th>N</th><th>Confidence</th></tr>
            </thead>
            <tbody>
              {formula.recommendations.filter((r: any) => r.value).map((r: any) => (
                <tr key={r.dimension}>
                  <td>{r.label}</td>
                  <td><strong style={{ color: 'var(--accent)' }}>{r.value}</strong></td>
                  <td>{r.n}</td>
                  <td><span className={`confidence ${r.confidence}`}>{r.confidence}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {formula?.references?.length > 0 && (
        <div className="panel">
          <h2>Reference creatives</h2>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            {formula.references.map((ref: any) => {
              const ratio = ref.actual_width && ref.actual_height ? ref.actual_width / ref.actual_height : 9 / 16;
              const aspect = ratio < 0.7 ? '9 / 16' : ratio < 0.95 ? '4 / 5' : ratio < 1.15 ? '1 / 1' : '16 / 9';
              return (
                <div key={ref.asset_id} className="card" onClick={() => router.push(`/asset/${ref.asset_id}`)}>
                  <div className="thumb" style={{ aspectRatio: aspect }}>
                    {ref.asset_type === 'image' ? (
                      <img src={`/media/${ref.asset_id}`} alt={ref.ad_name ?? ''} style={{ objectFit: 'contain' }} />
                    ) : (
                      <img src={`/media/${ref.asset_id}/frame/hook_0_5s`} alt={ref.ad_name ?? ''} style={{ objectFit: 'contain' }}
                        onError={(e) => ((e.currentTarget.style.display = 'none'))} />
                    )}
                  </div>
                  <div className="card-body">
                    <div className="card-title" title={ref.ad_name ?? ''}>{ref.ad_name ?? ref.asset_id}</div>
                    <div className="card-stats">
                      <div><div className="stat-label">Match</div><div className="stat-val">{(ref.match_score * 100).toFixed(0)}%</div></div>
                      <div><div className="stat-label">ROAS</div><div className="stat-val">{fmtNum(ref.roas)}</div></div>
                      <div><div className="stat-label">Hook</div><div className="stat-val">{fmtPct(ref.hook_rate)}</div></div>
                      <div><div className="stat-label">Spend</div><div className="stat-val">{fmtMoney(ref.spend)}</div></div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {formula?.risks?.length > 0 && (
        <div className="panel" style={{ borderColor: '#92400e' }}>
          <h2 style={{ color: 'var(--warn)' }}>Risks</h2>
          <ul style={{ paddingLeft: 18, lineHeight: 1.7 }}>
            {formula.risks.map((r: string, i: number) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}

      <div className="panel">
        <h2>Full markdown (export-ready)</h2>
        {editMode ? (
          <textarea value={draft.brief_markdown ?? ''} onChange={(e) => setDraft({ ...draft, brief_markdown: e.target.value })}
            style={{ width: '100%', minHeight: 400, padding: 12, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 4, fontFamily: 'ui-monospace, monospace', fontSize: 12 }} />
        ) : (
          <pre style={{ fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, monospace' }}>{b.brief_markdown}</pre>
        )}
      </div>

      <div className="panel">
        <h2>Notes</h2>
        {editMode ? (
          <textarea value={draft.notes ?? ''} onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            placeholder="Internal notes — not exported"
            style={{ width: '100%', minHeight: 80, padding: 8, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 4 }} />
        ) : (
          <div className="subtle">{b.notes ?? 'No notes.'}</div>
        )}
      </div>
    </div>
  );
}
