'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signInWithGoogle, useUser } from '../lib/session';

function LoginInner() {
  const router = useRouter();
  const search = useSearchParams();
  const user = useUser();
  const [signing, setSigning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const next = search.get('next') || '/inspiration';

  useEffect(() => {
    if (user) router.replace(next);
  }, [user, next, router]);

  async function go() {
    setSigning(true);
    setErr(null);
    try {
      await signInWithGoogle(next);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
      setSigning(false);
    }
  }

  return (
    <main style={{ maxWidth: 480, margin: '80px auto' }}>
      <div className="panel" style={{ padding: 32, textAlign: 'center' }}>
        <h1 style={{ marginBottom: 8 }}>Sign in to Inspiration</h1>
        <p className="subtle" style={{ marginBottom: 24 }}>
          BSC Creative Intelligence Tool. Sign in with your yoso.media Google account.
        </p>
        <button
          onClick={go}
          disabled={signing}
          style={{
            padding: '10px 18px',
            background: '#fff',
            color: '#222',
            border: '1px solid #ddd',
            borderRadius: 4,
            fontSize: 15,
            cursor: 'pointer',
          }}
        >
          {signing ? 'Redirecting…' : 'Continue with Google'}
        </button>
        {err && <div className="panel" style={{ background: '#fee', marginTop: 16 }}>{err}</div>}
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="panel" style={{ maxWidth: 480, margin: '80px auto' }}>Loading…</main>}>
      <LoginInner />
    </Suspense>
  );
}
