import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = import.meta.env.REACT_APP_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = import.meta.env.REACT_APP_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase = isConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;

/** Supabase returns max 1000 rows per request — this pages through everything. */
export async function fetchAll(buildQuery, pageSize = 1000) {
  let from = 0;
  const out = [];
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) throw error;
    out.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

/** Calls the server-side admin function (create teacher logins, reset passwords). */
export async function adminApi(action, payload) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch('/api/admin-users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
    body: JSON.stringify({ action, ...payload }),
  });
  let body = {};
  try { body = await res.json(); } catch { /* not JSON */ }
  if (!res.ok) throw new Error(body.error || `Server error (${res.status})`);
  return body;
}
