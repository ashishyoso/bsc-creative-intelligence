'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

export default function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className="settings-gear"
        onClick={() => setOpen((o) => !o)}
        aria-label="Settings"
        title="Settings"
      >⚙</button>
      {open && (
        <div className="settings-menu">
          <Link href="/ingest" onClick={() => setOpen(false)}>Ingest pipeline</Link>
          <Link href="/mapping-queue" onClick={() => setOpen(false)}>Mapping queue</Link>
          <Link href="/review" onClick={() => setOpen(false)}>Auto-tag review</Link>
        </div>
      )}
    </div>
  );
}
