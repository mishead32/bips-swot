// Vercel serverless function: creates / updates teacher logins.
// Uses the SERVICE ROLE key, which stays on the server and is never sent to the browser.
// Only a logged-in ADMIN can call it.
import { createClient } from '@supabase/supabase-js';

const URL = process.env.REACT_APP_SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  if (!URL || !SERVICE_KEY) {
    return res.status(500).json({ error: 'Server keys missing. Add SUPABASE_SERVICE_ROLE_KEY in Vercel > Settings > Environment Variables, then Redeploy.' });
  }
  const admin = createClient(URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  // 1. Who is calling? Must be an active admin.
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Not logged in' });
  const { data: who, error: whoErr } = await admin.auth.getUser(token);
  if (whoErr || !who?.user) return res.status(401).json({ error: 'Session expired. Please log in again.' });
  const { data: me } = await admin.from('teachers').select('role,is_active').eq('id', who.user.id).maybeSingle();
  if (!me || me.role !== 'admin' || !me.is_active) return res.status(403).json({ error: 'Only Admin can do this' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const { action } = body;

  try {
    if (action === 'create') {
      const email = String(body.email || '').trim().toLowerCase();
      const name = String(body.name || '').trim();
      const password = String(body.password || '');
      if (!email || !name) return res.status(400).json({ error: 'Name and email are required' });
      if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

      let userId;
      const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } });
      if (error) {
        // Login already exists? Re-use it.
        if (!/already|registered|exists/i.test(error.message)) throw error;
        const found = await findUserByEmail(admin, email);
        if (!found) throw error;
        userId = found.id;
        await admin.auth.admin.updateUserById(userId, { password });
      } else {
        userId = created.user.id;
      }
      const { error: insErr } = await admin.from('teachers').upsert({
        id: userId, email, name,
        role: body.role === 'hod' ? 'hod' : 'teacher',   // only one Admin; new users are Teacher or Head of Department
        assigned_classes: Array.isArray(body.assigned_classes) ? body.assigned_classes : [],
        phone: body.phone || null,
        is_active: true,
      });
      if (insErr) throw insErr;
      return res.status(200).json({ ok: true, id: userId });
    }

    if (action === 'reset_password') {
      if (!body.id || String(body.password || '').length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
      const { error } = await admin.auth.admin.updateUserById(body.id, { password: body.password });
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    if (action === 'delete') {
      if (!body.id) return res.status(400).json({ error: 'Missing id' });
      if (body.id === who.user.id) return res.status(400).json({ error: 'You cannot delete yourself' });
      const { error } = await admin.auth.admin.deleteUser(body.id); // teachers row is removed automatically
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}

async function findUserByEmail(admin, email) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return null;
    const u = data.users.find((x) => (x.email || '').toLowerCase() === email);
    if (u) return u;
    if (data.users.length < 200) return null;
  }
  return null;
}
