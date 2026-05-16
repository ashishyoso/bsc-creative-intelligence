// Browser-side Supabase client for the Inspiration tool.
// Used for Google SSO sign-in via Supabase Auth and to retrieve the access
// token that the Inspiration API client forwards as a Bearer header.
//
// Env (must be exposed to the browser, hence NEXT_PUBLIC_ prefix):
// - NEXT_PUBLIC_SUPABASE_URL
// - NEXT_PUBLIC_SUPABASE_ANON_KEY

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set'
    );
  }
  _client = createBrowserClient(url, anonKey);
  return _client;
}
