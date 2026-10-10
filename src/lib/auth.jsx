import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { SESSIONS } from './config';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null); // row from teachers table
  const [profileError, setProfileError] = useState('');
  const [loading, setLoading] = useState(true);
  const [masters, setMasters] = useState(null);
  const [academicSession, setAcademicSession] = useState(() => {
    try { return localStorage.getItem('bips_session') || SESSIONS[0]; } catch { return SESSIONS[0]; }
  });

  const loadProfile = useCallback(async (sess) => {
    if (!sess) { setProfile(null); setMasters(null); return; }
    const { data, error } = await supabase.from('teachers').select('*').eq('id', sess.user.id).maybeSingle();
    if (error) { setProfileError(error.message); setProfile(null); return; }
    if (!data) { setProfileError('Your login works, but you are not added in the "teachers" table yet. Ask the Admin.'); setProfile(null); return; }
    if (!data.is_active) { setProfileError('Your account is deactivated. Please contact the Admin.'); setProfile(null); return; }
    setProfileError('');
    setProfile(data);
    await loadMasters();
  }, []);

  const loadMasters = useCallback(async () => {
    const [cls, heads, items, subs, forms, crit] = await Promise.all([
      supabase.from('classes').select('*').order('sort_order'),
      supabase.from('swot_headings').select('*').order('sort_order'),
      supabase.from('swot_items').select('*').order('sort_order'),
      supabase.from('subjects').select('*').order('sort_order'),
      supabase.from('eval_forms').select('*').order('sort_order'),
      supabase.from('eval_criteria').select('*').order('sort_order'),
    ]);
    setMasters({
      classes: cls.data || [],
      headings: heads.data || [],
      items: items.data || [],
      subjects: subs.data || [],
      evalForms: forms.data || [],
      evalCriteria: crit.data || [],
    });
  }, []);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      setSession(data.session);
      await loadProfile(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      setSession(sess);
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        setTimeout(() => loadProfile(sess), 0);
      }
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [loadProfile]);

  const changeSession = (s) => {
    setAcademicSession(s);
    try { localStorage.setItem('bips_session', s); } catch { /* ignore */ }
  };

  const isAdmin = profile?.role === 'admin';
  const isHod = profile?.role === 'admin' || profile?.role === 'hod';
  const myClasses = !masters ? [] : isAdmin
    ? masters.classes.filter((c) => c.is_active)
    : masters.classes.filter((c) => c.is_active && profile?.assigned_classes?.includes(c.id));

  const value = {
    session, profile, profileError, loading, masters, isAdmin, isHod, myClasses,
    academicSession, changeSession,
    reloadMasters: loadMasters,
    signOut: () => supabase.auth.signOut(),
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
