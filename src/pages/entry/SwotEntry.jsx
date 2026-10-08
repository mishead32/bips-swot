import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchAll, supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { parseYM, previousYM, todayStr, ymLabel, ymOf } from '../../lib/config';
import { errMsg, sortStudents } from '../../lib/util';
import { ClassSelect } from '../../components/Pickers';
import { Confirm, Empty, Field, Spinner, useToast } from '../../components/ui';
import HeadingCard from './HeadingCard';
import AcademicCard from './AcademicCard';
import { cellKey } from './cells';

export default function SwotEntry() {
  const { masters, myClasses, isAdmin, profile } = useAuth();
  const toast = useToast();
  const [sp, setSp] = useSearchParams();

  const date = sp.get('date') || todayStr();
  const ym = sp.get('ym') || ymOf(date);
  const urlClass = sp.get('class');
  const classId = urlClass && myClasses.some((c) => c.id === urlClass) ? urlClass : (myClasses.length === 1 ? myClasses[0].id : '');
  const set = (obj) => { const n = new URLSearchParams(sp); Object.entries(obj).forEach(([k, v]) => n.set(k, v)); setSp(n, { replace: true }); };

  const { year, month, session } = parseYM(ym);
  const prev = parseYM(previousYM(ym));
  const ctx = useMemo(() => ({ date, year, month, session, classId, prevSession: prev.session, prevMonth: prev.month }),
    [date, year, month, session, classId, prev.session, prev.month]);

  const headings = masters.headings.filter((h) => h.is_active);
  const itemsBy = useMemo(() => {
    const m = {};
    masters.items.filter((i) => i.is_active).forEach((i) => { (m[i.heading_code] ||= []).push(i); });
    return m;
  }, [masters.items]);
  const subjects = useMemo(() => masters.subjects.filter((s) => s.is_active), [masters.subjects]);

  const [students, setStudents] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dirty, setDirty] = useState({});
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const savers = useRef({});

  const load = useCallback(async () => {
    if (!classId) return;
    setLoading(true);
    try {
      const [st, vals] = await Promise.all([
        supabase.from('students').select('id,name,admission_number,roll_number').eq('class_id', classId).eq('is_active', true),
        fetchAll(() => supabase.from('swot_values').select('*').eq('session', session).eq('month', month).eq('class_id', classId).order('id')),
      ]);
      if (st.error) throw st.error;
      setStudents(sortStudents(st.data));
      setRows(vals);
    } catch (e) { toast(errMsg(e), 'err'); }
    setLoading(false);
  }, [classId, session, month, toast]);
  useEffect(() => { load(); }, [load]);

  const reloadValues = useCallback(async () => {
    try {
      const vals = await fetchAll(() => supabase.from('swot_values').select('*').eq('session', session).eq('month', month).eq('class_id', classId).order('id'));
      setRows(vals);
    } catch (e) { toast(errMsg(e), 'err'); }
  }, [session, month, classId, toast]);

  // saved values split by heading (stable objects so cards don't re-render needlessly)
  const savedCache = useRef({});
  const savedBy = useMemo(() => {
    const itemHeading = {};
    masters.items.forEach((i) => { itemHeading[i.id] = i.heading_code; });
    const m = {};
    headings.forEach((h) => { m[h.code] = {}; });
    rows.forEach((r) => { const h = itemHeading[r.item_id]; if (m[h]) m[h][cellKey(r.student_id, r.item_id)] = r; });
    // keep the same object for headings whose data did not change -> their unsaved boxes are kept
    Object.keys(m).forEach((code) => {
      const sig = JSON.stringify(m[code]);
      const c = savedCache.current[code];
      if (c && c.sig === sig && c.ctx === `${classId}|${ym}`) m[code] = c.obj;
      else savedCache.current[code] = { sig, obj: m[code], ctx: `${classId}|${ym}` };
    });
    return m;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, masters.items]);

  const onDirty = useCallback((code, n) => setDirty((d) => (d[code] === n ? d : { ...d, [code]: n })), []);
  const registerSaver = useCallback((code, fn) => { savers.current[code] = fn; }, []);
  const totalDirty = Object.values(dirty).reduce((a, b) => a + b, 0);

  useEffect(() => {
    const h = (e) => { if (totalDirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [totalDirty]);

  async function saveAll() {
    setBusy(true);
    let ok = true;
    for (const h of headings) {
      if (dirty[h.code] && savers.current[h.code]) ok = (await savers.current[h.code]()) && ok;
    }
    await reloadValues();
    setBusy(false);
    setAsk(false);
    if (ok) toast('All headings saved ✔');
  }

  const goto = (code) => document.getElementById(`h-${code}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="page">
      <div className="filters card sticky-filters">
        <Field label="Date"><input type="date" value={date} onChange={(e) => e.target.value && set({ date: e.target.value, ym: ymOf(e.target.value) })} /></Field>
        <Field label="Month - Year (data is for)"><input type="month" value={ym} onChange={(e) => e.target.value && set({ ym: e.target.value })} /></Field>
        <Field label="Class"><ClassSelect classes={myClasses} value={classId} onChange={(v) => set({ class: v })} /></Field>
        <div className="filter-info">
          <div className="fi-big">{ymLabel(ym)}</div>
          <div className="muted small">Session {session}</div>
        </div>
      </div>

      {!myClasses.length && <Empty icon="🏫" title="No class assigned to you yet">Ask the Admin to assign your class(es).</Empty>}
      {myClasses.length > 0 && !classId && <Empty icon="👆" title="Select the class to open the SWOT sheet" />}

      {classId && (loading ? <Spinner text="Opening SWOT sheet…" /> : !students.length ? (
        <Empty icon="🧒" title="No students in this class">Admin can import students in Admin Panel → Bulk Import.</Empty>
      ) : (
        <>
          <div className="hnav">
            {headings.map((h, i) => {
              const n = Object.keys(savedBy[h.code] || {}).length;
              return (
                <button key={h.code} className={`hnav-chip ${dirty[h.code] ? 'is-dirty' : n ? 'has' : ''}`} onClick={() => goto(h.code)} title={h.name}>
                  <b>{i + 1}</b> {h.name.length > 22 ? h.name.slice(0, 20) + '…' : h.name}
                </button>
              );
            })}
          </div>

          {headings.map((h, i) => (h.code === 'academic' ? (
            <AcademicCard key={`${h.code}-${classId}-${ym}`} number={i + 1} heading={h} students={students} subjects={subjects}
              isAdmin={isAdmin} ctx={ctx} profile={profile} registerSaver={registerSaver} onDirty={onDirty} />
          ) : (
            <HeadingCard key={`${h.code}-${classId}-${ym}`} number={i + 1} heading={h} items={itemsBy[h.code] || []} students={students}
              saved={savedBy[h.code] || {}} isAdmin={isAdmin} ctx={ctx} onReload={reloadValues}
              registerSaver={registerSaver} onDirty={onDirty} />
          )))}

          <div className="savebar">
            <div className="savebar-info">
              {totalDirty ? <span><b>{totalDirty}</b> unsaved box(es) in {Object.values(dirty).filter(Boolean).length} heading(s)</span> : <span className="muted">Nothing unsaved</span>}
              <span className="muted"> · {classId} · {ymLabel(ym)}</span>
            </div>
            <button className="btn btn-primary" disabled={busy || !totalDirty} onClick={() => (isAdmin ? saveAll() : setAsk(true))}>
              {busy ? 'Saving…' : isAdmin ? 'Save all headings' : 'Save all & lock 🔒'}
            </button>
          </div>
        </>
      ))}

      {ask && (
        <Confirm title="Save and lock?" busy={busy} confirmText="Yes, save & lock"
          message={<>All filled boxes will be saved for <b>{classId}</b> · <b>{ymLabel(ym)}</b>. <br /><br />After saving, you <b>cannot change</b> them. Only the Admin can edit or delete. Empty boxes stay open for later.</>}
          onNo={() => setAsk(false)} onYes={saveAll} />
      )}
    </div>
  );
}
