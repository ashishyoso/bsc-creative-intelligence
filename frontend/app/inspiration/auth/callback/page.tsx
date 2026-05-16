'use client';
import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSupabase } from '../../lib/supabase';

// Supabase Auth redirects here after Google OAuth. The hash fragment carries
// the access_token; supabase-js handles the exchange when getSession() runs.
function Callback() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get('next') || '/inspiration';

  useEffect(() => {
    const supabase = getSupabase();
    (async () => {
      // Trigger session pickup from the URL fragment.
      await supabase.auth.getSession();
      router.replace(next);
    })();
  }, [router, next]);

  return (
    <main className="panel" style={{ maxWidth: 480, margin: '80px auto', textAlign: 'center' }}>
      Signing you in…
    </main>
  );
}

export default function AuthCallback() {
  return (
    <Suspense fallback={<main className="panel" style={{ maxWidth: 480, margin: '80px auto' }}>Loading…</main>}>
      <Callback />
    </Suspense>
  );
}
