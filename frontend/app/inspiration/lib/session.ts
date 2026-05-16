'use client';
import { useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { getSupabase } from './supabase';

// React hook returning the current Supabase Auth session (or null).
// The session contains access_token, which the Inspiration API client uses
// as a Bearer for backend calls.
export function useSession() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    const supabase = getSupabase();
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => { sub.subscription.unsubscribe(); };
  }, []);

  return session; // undefined = loading, null = not signed in, Session = signed in
}

export function useUser(): User | null | undefined {
  const session = useSession();
  if (session === undefined) return undefined;
  return session?.user ?? null;
}

// Used by the API client (api.ts) to attach Authorization header.
// Reads the current session synchronously from the cached client.
export async function getAccessToken(): Promise<string | null> {
  const supabase = getSupabase();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function signInWithGoogle(redirectTo: string = '/inspiration'): Promise<void> {
  const supabase = getSupabase();
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${origin}/inspiration/auth/callback?next=${encodeURIComponent(redirectTo)}`,
    },
  });
}

export async function signOut(): Promise<void> {
  const supabase = getSupabase();
  await supabase.auth.signOut();
}
