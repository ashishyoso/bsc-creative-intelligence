'use client';
import { useRef } from 'react';
import { AssetSummary, classifyHook, classifyRoas, fmtMoney, fmtNum, fmtPct, mediaUrlFor } from '../lib/api';

function aspectRatioCSS(w: number | null, h: number | null): string {
  if (!w || !h || w <= 0 || h <= 0) return '9 / 16';
  const ratio = w / h;
  // Snap to the canonical Meta creative ratios so cards align in the grid.
  if (ratio < 0.7) return '9 / 16';
  if (ratio < 0.95) return '4 / 5';
  if (ratio < 1.15) return '1 / 1';
  return '16 / 9';
}

export default function AssetCard({
  a,
  onClick,
  selectable = false,
  selected = false,
  onToggleSelect,
}: {
  a: AssetSummary;
  onClick: () => void;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isImage = a.asset_type === 'image';
  const aspect = aspectRatioCSS(a.actual_width, a.actual_height);

  function onEnter() {
    if (!isImage && videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
    }
  }
  function onLeave() {
    if (!isImage && videoRef.current) {
      videoRef.current.pause();
      try { videoRef.current.currentTime = 0.5; } catch {}
    }
  }

  const mediaUrl = mediaUrlFor(a);
  // Append a t=0.5 fragment so the browser seeks to 0.5s for the poster frame.
  // Browsers only fetch metadata + a tiny seek window — cheaper than fetching a
  // full thumbnail, and works without any server-side frame extraction.
  const videoSrc = !isImage ? `${mediaUrl}#t=0.5` : mediaUrl;

  return (
    <div
      className={`card ${selected ? 'card-selected' : ''}`}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={onClick}
    >
      {selectable && (
        <div
          className="card-select"
          onClick={(e) => { e.stopPropagation(); onToggleSelect?.(); }}
          title={selected ? 'Deselect' : 'Select for compare'}
        >
          <span className={`checkbox ${selected ? 'checked' : ''}`}>
            {selected && '✓'}
          </span>
        </div>
      )}
      <div className="thumb" style={{ aspectRatio: aspect }}>
        {isImage ? (
          <img src={mediaUrl} alt={a.primary_ad_name ?? a.asset_id} loading="lazy" style={{ objectFit: 'contain' }} />
        ) : (
          <video
            ref={videoRef}
            src={videoSrc}
            muted
            loop
            playsInline
            preload="metadata"
            style={{ objectFit: 'contain' }}
          />
        )}
        {isImage && <span className="badge image">image</span>}
        {a.mapping_status !== 'VERIFIED' && a.mapping_status !== 'MANUALLY_CONFIRMED' && (
          <span className="badge suspect">{a.mapping_status}</span>
        )}
        <div className="card-actions" onClick={(e) => e.stopPropagation()}>
          <a
            className="card-action"
            href={`/api/assets/${a.asset_id}/download`}
            target="_blank"
            rel="noreferrer"
            title="Download original"
          >↓</a>
        </div>
      </div>
      <div className="card-body">
        <div className="card-title" title={a.primary_ad_name ?? ''}>{a.primary_ad_name ?? a.asset_id}</div>
        <div className="card-stats">
          <div>
            <div className="stat-label">Spend</div>
            <div className="stat-val">{fmtMoney(a.spend)}</div>
          </div>
          <div>
            <div className="stat-label">ROAS</div>
            <div className={`stat-val ${classifyRoas(a.roas, a.sku) ?? ''}`}>{fmtNum(a.roas)}</div>
          </div>
          <div>
            <div className="stat-label">Hook</div>
            <div className={`stat-val ${classifyHook(a.hook_rate) ?? ''}`}>{fmtPct(a.hook_rate)}</div>
          </div>
          <div>
            <div className="stat-label">Hold</div>
            <div className="stat-val">{fmtPct(a.hold_rate)}</div>
          </div>
          <div>
            <div className="stat-label">CTR</div>
            <div className="stat-val">{fmtPct(a.ctr, 2)}</div>
          </div>
          <div>
            <div className="stat-label">Dur</div>
            <div className="stat-val">{a.actual_duration_seconds ? `${a.actual_duration_seconds.toFixed(0)}s` : '—'}</div>
          </div>
        </div>
        <div className="chips">
          {a.sku && <span className="chip">{a.sku}</span>}
          {a.hook_archetype && <span className="chip">{a.hook_archetype}</span>}
          {a.audio_language && <span className="chip">{a.audio_language}</span>}
          {a.brand_visible_first_3s === true && <span className="chip" style={{ color: '#fbbf24' }}>brand &lt;3s</span>}
        </div>
      </div>
    </div>
  );
}
