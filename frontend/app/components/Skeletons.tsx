'use client';

export function Skeleton({
  width,
  height,
  rounded = 4,
  style,
}: {
  width?: number | string;
  height?: number | string;
  rounded?: number;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className="skeleton"
      style={{
        width: width ?? '100%',
        height: height ?? 14,
        borderRadius: rounded,
        ...style,
      }}
    />
  );
}

export function CardSkeleton({ aspect = '9 / 16' }: { aspect?: string }) {
  return (
    <div className="card skeleton-card">
      <div className="thumb skeleton" style={{ aspectRatio: aspect }} />
      <div className="card-body">
        <Skeleton height={14} width="80%" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px 12px', marginTop: 10 }}>
          {[...Array(6)].map((_, i) => (
            <div key={i}>
              <Skeleton height={9} width="40%" style={{ marginBottom: 4 }} />
              <Skeleton height={14} width="55%" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function CardGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid">
      {[...Array(count)].map((_, i) => <CardSkeleton key={i} />)}
    </div>
  );
}

export function TableSkeleton({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="panel" style={{ padding: 0 }}>
      <table className="table">
        <thead>
          <tr>
            {[...Array(cols)].map((_, i) => (
              <th key={i}><Skeleton height={10} width={80} /></th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...Array(rows)].map((_, r) => (
            <tr key={r}>
              {[...Array(cols)].map((_, c) => (
                <td key={c}><Skeleton height={12} width={c === 0 ? 140 : 60 + Math.random() * 40} /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PanelSkeleton({ lines = 6 }: { lines?: number }) {
  return (
    <div className="panel">
      <Skeleton height={12} width={120} style={{ marginBottom: 14 }} />
      <div style={{ display: 'grid', gap: 10 }}>
        {[...Array(lines)].map((_, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 12 }}>
            <Skeleton height={11} width={120} />
            <Skeleton height={11} />
          </div>
        ))}
      </div>
    </div>
  );
}
