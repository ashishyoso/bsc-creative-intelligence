'use client';
import { VideoSummary } from '../lib/api';

// US-3.3 inline player + US-3.4 metadata display.
export default function VideoCard({ video }: { video: VideoSummary }) {
  const url = video.video_url_cached || video.video_url;
  return (
    <div className="panel" style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div>
          <span style={{ fontWeight: 600 }}>{video.brand}</span>
          <span className="subtle" style={{ marginLeft: 8 }}>· {video.source_channel}</span>
          {video.is_internal && (
            <span style={{ marginLeft: 8, padding: '2px 6px', background: '#fff7cc', borderRadius: 4 }}>internal</span>
          )}
        </div>
        <a href={video.video_url} target="_blank" rel="noopener" className="subtle">View on {video.source_channel} ↗</a>
      </div>

      <div style={{ background: '#000', maxHeight: 480, display: 'flex', justifyContent: 'center' }}>
        {url ? (
          <video src={url} controls autoPlay muted style={{ maxWidth: '100%', maxHeight: 480 }} />
        ) : (
          <div className="subtle" style={{ padding: 32 }}>Source unavailable</div>
        )}
      </div>

      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          {video.headline && <p><strong>{video.headline}</strong></p>}
          {video.cta_text && <p className="subtle">CTA: {video.cta_text}</p>}
        </div>
        <div style={{ textAlign: 'right' }} className="subtle">
          {video.days_running != null && <div>{video.days_running} days running</div>}
          {video.duration_seconds != null && <div>{video.duration_seconds.toFixed(1)}s</div>}
          {video.aspect_ratio && <div>{video.aspect_ratio}</div>}
        </div>
      </div>

      {video.is_internal && video.performance && (
        <div className="panel" style={{ background: '#f9f9f9', marginTop: 12 }}>
          {video.performance.roas != null && <span style={{ marginRight: 12 }}>ROAS {Number(video.performance.roas).toFixed(2)}</span>}
          {video.performance.ctr != null && <span style={{ marginRight: 12 }}>CTR {(Number(video.performance.ctr) * 100).toFixed(2)}%</span>}
          {video.performance.spend != null && <span style={{ marginRight: 12 }}>Spend ₹{Number(video.performance.spend).toLocaleString()}</span>}
        </div>
      )}
    </div>
  );
}
