'use client';
import { useRef, useState } from 'react';
import { VideoSummary } from '../lib/api';

function asEmbed(url: string): { kind: 'iframe' | 'video' | 'none'; src: string } {
  if (!url) return { kind: 'none', src: '' };
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  if (yt) return { kind: 'iframe', src: `https://www.youtube.com/embed/${yt[1]}?modestbranding=1&rel=0` };
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) return { kind: 'iframe', src: `https://player.vimeo.com/video/${vimeo[1]}` };
  const ig = url.match(/instagram\.com\/(?:reel|p)\/([A-Za-z0-9_-]+)/);
  if (ig) return { kind: 'iframe', src: `https://www.instagram.com/p/${ig[1]}/embed/` };
  return { kind: 'video', src: url };
}

const SOURCE_ICON: Record<string, string> = {
  meta_ad_library: '📘',
  meta_marketing: '📊',
  youtube: '▶',
  tiktok: '🎵',
  brand_site: '🌐',
  manual: '✋',
};

type Props = {
  video: VideoSummary;
  selected?: boolean;
  onClick: () => void;
  onSave: () => void;
  onReject: () => void;
  onEscalate: () => void;
};

// Foreplay-style grid card: 9:16 thumbnail with hover-play, brand badge,
// source icon, days running, headline, quick-action row.
export default function VideoGridCard({ video, selected, onClick, onSave, onReject, onEscalate }: Props) {
  const url = video.video_url_cached || video.video_url;
  const embed = asEmbed(url);
  const [hovered, setHovered] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  function handleEnter() {
    setHovered(true);
    if (embed.kind === 'video' && videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  }

  function handleLeave() {
    setHovered(false);
    if (embed.kind === 'video' && videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }

  return (
    <div
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onClick={onClick}
      style={{
        background: '#0f0f12',
        borderRadius: 8,
        overflow: 'hidden',
        cursor: 'pointer',
        border: selected ? '2px solid #4caf50' : '1px solid #2a2a2e',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header strip: brand + source + days running */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', fontSize: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{ flex: '0 0 auto' }}>{SOURCE_ICON[video.source_channel] ?? '·'}</span>
          <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{video.brand}</strong>
        </div>
        <span className="subtle" style={{ fontSize: 11 }}>
          {video.days_running != null ? `${video.days_running}d` : video.is_internal ? 'internal' : 'new'}
        </span>
      </div>

      {/* Thumbnail / video preview */}
      <div style={{ position: 'relative', background: '#000', aspectRatio: '9 / 16', overflow: 'hidden' }}>
        {video.video_thumbnail && !hovered && (
          <img src={video.video_thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        )}
        {embed.kind === 'iframe' && hovered && (
          <iframe
            src={embed.src + '&autoplay=1&mute=1'}
            allow="autoplay; encrypted-media"
            style={{ width: '100%', height: '100%', border: 0, position: 'absolute', inset: 0 }}
          />
        )}
        {embed.kind === 'video' && (
          <video
            ref={videoRef}
            src={embed.src}
            muted
            loop
            playsInline
            preload="metadata"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )}
        {embed.kind === 'none' && (
          <div className="subtle" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            no preview
          </div>
        )}
        {video.is_internal && (
          <span style={{ position: 'absolute', top: 8, right: 8, background: '#fff7cc', color: '#222', padding: '2px 6px', borderRadius: 3, fontSize: 11 }}>
            internal
          </span>
        )}
      </div>

      {/* Headline */}
      {(video.headline || video.title) && (
        <p style={{ padding: '8px 10px 4px', fontSize: 13, minHeight: 40, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          {video.headline ?? video.title}
        </p>
      )}

      {/* Quick actions */}
      <div
        style={{ display: 'flex', gap: 4, padding: '8px 10px 10px', borderTop: '1px solid #1f1f23' }}
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onSave} style={{ flex: 1, padding: '6px 8px', background: '#1b5e20', color: 'white', fontSize: 12, border: 0, borderRadius: 4, cursor: 'pointer' }}>
          Save
        </button>
        <button onClick={onReject} style={{ flex: 1, padding: '6px 8px', background: '#3a1f1f', color: '#ffcdd2', fontSize: 12, border: 0, borderRadius: 4, cursor: 'pointer' }}>
          Reject
        </button>
        <button onClick={onEscalate} title="Escalate" style={{ padding: '6px 8px', background: '#263238', color: 'white', fontSize: 12, border: 0, borderRadius: 4, cursor: 'pointer' }}>
          ↑
        </button>
      </div>
    </div>
  );
}
