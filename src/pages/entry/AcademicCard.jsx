import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { GRADES, TEST_TYPES, monthLabel } from '../../lib/config';
import { avg, errMsg, fmt } from '../../lib/util';
import { Confirm, Field, Modal, useToast } from '../../components/ui';

const STATUS = { AB: 'Ab', NA: 'NA', ML: 'ML' };
const normStatus = (v) => STATUS[String(v || '').toUpperCase()] || null;
const dmy = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '');
const defaultMax = (type) => (/Half|Final/.test(type) ? 100 : /Periodic/.test(type) ? 20 : 10);

function markRaw(m) {
  if (!m) return '';
  if (m.status !== 'P') return m.status;
  if (m.grade) return m.grade;
  return m.marks == null ? '' : String(Number(m.marks));
}

function AcademicCard({ number, heading, students, subjects, isAdmin, ctx, profile, registerSaver, onDirty }) {
  const toast = useToast();
  const [open, setOpen] = useState(true);
  const [tests, setTests] = useState([]);
  const [marks, setMarks] = useState({}); // `${testId}|${sid}` -> row
  const [draft, setDraft] = useState({});
  const [subjectId, setSubjectId] = useState(subjects[0]?.id || 0);
  const [form, setForm] = useState(null);
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data: t, error } = await supabase.from('academic_tests').select('*')
      .eq('session', ctx.session).eq('month', ctx.month).eq('class_id', ctx.classId).order('test_date');
    if (error) return toast(errMsg(error), 'err');
    setTests(t);
    const ids = t.map((x) => x.id);
    const m = {};
    if (ids.length) {
      const { data, error: e2 } = await supabase.from('academic_marks').select('*').in('test_id', ids);
      if (e2) return toast(errMsg(e2), 'err');
      data.forEach((r) => { m[`${r.test_id}|${r.student_id}`] = r; });
    }
    setMarks(m);
    const d = {};
    t.forEach((x) => students.forEach((s) => { d[`${x.id}|${s.id}`] = markRaw(m[`${x.id}|${s.id}`]); }));
    setDraft(d);
  }, [ctx.session, ctx.month, ctx.classId, students, toast]);

  useEffect(() => { load(); }, [load]);

  const subject = subjects.find((s) => s.id === subjectId);
  const subTests = tests.filter((t) => t.subject_id === subjectId);
  const editable = (k) => isAdmin || !marks[k];

  const check = (t, v) => {
    if (!v) return '';
    if (normStatus(v)) return '';
    const sub = subjects.find((s) => s.id === t.subject_id);
    if (sub?.grade_based) return GRADES.includes(v.toUpperCase()) ? '' : 'grade';
    return /^\d{1,3}(\.\d{1,2})?$/.test(v) && Number(v) <= Number(t.max_marks || 0) ? '' : `max ${fmt(t.max_marks)}`;
  };

  const { changes, errors } = useMemo(() => {
    const ch = []; const er = {};
    tests.forEach((t) => students.forEach((s) => {
      const k = `${t.id}|${s.id}`;
      if (!editable(k) || draft[k] === undefined) return;
      if ((draft[k] || '') === markRaw(marks[k])) return;
      const e = check(t, draft[k]); if (e) er[k] = e;
      ch.push({ k, t, s });
    }));
    return { changes: ch, errors: er };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, marks, tests, students, isAdmin]);

  useEffect(() => { onDirty('academic', changes.length); }, [changes.length, onDirty]);

  async function save() {
    if (!changes.length) return true;
    if (Object.keys(errors).length) { toast(`ACADEMIC RECORD: ${Object.keys(errors).length} wrong mark(s) (red).`, 'err'); setOpen(true); return false; }
    setBusy(true);
    try {
      const ups = []; const dels = [];
      changes.forEach(({ k, t, s }) => {
        const v = (draft[k] || '').trim();
        if (!v) { if (marks[k]) dels.push(marks[k].id); return; }
        const st = normStatus(v);
        const gb = subjects.find((x) => x.id === t.subject_id)?.grade_based;
        ups.push({ test_id: t.id, student_id: s.id, status: st || 'P', marks: !st && !gb ? Number(v) : null, grade: !st && gb ? v.toUpperCase() : null });
      });
      if (ups.length) {
        const q = isAdmin ? supabase.from('academic_marks').upsert(ups, { onConflict: 'test_id,student_id' }) : supabase.from('academic_marks').insert(ups);
        const { error } = await q; if (error) throw error;
      }
      if (dels.length) { const { error } = await supabase.from('academic_marks').delete().in('id', dels); if (error) throw error; }
      toast(`ACADEMIC RECORD: ${ups.length} mark(s) saved ✔`);
      await load();
      return true;
    } catch (e) {
      toast(e.code === '23505' ? 'Some marks were already entered by someone else. Refreshed.' : errMsg(e), 'err');
      await load();
      return false;
    } finally { setBusy(false); }
  }

  useEffect(() => { registerSaver('academic', save); });

  const dateInMonth = ctx.date && Number(ctx.date.slice(5, 7)) === ctx.month && Number(ctx.date.slice(0, 4)) === ctx.year;

  function newTest() {
    const type = ctx.month === 9 ? 'Half Yearly Exam' : 'Weekly Test';
    setForm({ test_date: ctx.date, test_type: type, topic: '', max_marks: String(defaultMax(type)), teacher_name: profile.name });
  }

  async function saveTest() {
    const f = form;
    if (!f.test_date) return toast('Choose test date', 'err');
    if (!subject.grade_based && !(Number(f.max_marks) > 0)) return toast('Enter max marks', 'err');
    const m = Number(f.test_date.slice(5, 7));
    if (m !== ctx.month) return toast(`Test date must be in ${monthLabel(ctx.month)} ${ctx.year}`, 'err');
    setBusy(true);
    const payload = { session: ctx.session, month: ctx.month, class_id: ctx.classId, subject_id: subjectId, test_date: f.test_date, test_type: f.test_type, topic: f.topic || null, max_marks: subject.grade_based ? null : Number(f.max_marks), teacher_name: f.teacher_name || null };
    const { error } = f.id ? await supabase.from('academic_tests').update(payload).eq('id', f.id) : await supabase.from('academic_tests').insert(payload);
    setBusy(false);
    if (error) return toast(error.code === '23505' ? 'This test (same date & type) already exists for this subject.' : errMsg(error), 'err');
    toast(f.id ? 'Test updated' : 'Test added — now enter marks');
    setForm(null);
    load();
  }

  async function deleteTest() {
    setBusy(true);
    const { error } = await supabase.from('academic_tests').delete().eq('id', del.id);
    setBusy(false);
    if (error) return toast(errMsg(error), 'err');
    toast('Test and its marks deleted');
    setDel(null);
    load();
  }

  const onKey = (e, r, c) => {
    if (['Enter', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
      const el = document.querySelector(`[data-nav="ac-${e.key === 'ArrowUp' ? r - 1 : r + 1}-${c}"]`);
      if (el) { e.preventDefault(); el.focus(); el.select(); }
    }
  };

  return (
    <section className="hcard" id="h-academic">
      <header className="hcard-head" onClick={() => setOpen(!open)}>
        <span className="hnum">{number}</span>
        <div className="hcard-title"><h3>{heading.name}</h3><div className="hnote">{heading.scale_note}</div></div>
        <span className="hcount">{tests.length} test(s) in {monthLabel(ctx.month)}</span>
        <span className="chev">{open ? '▾' : '▸'}</span>
      </header>
      {open && (
        <div className="hcard-body">
          <div className="subj-pills">
            {subjects.map((s) => {
              const n = tests.filter((t) => t.subject_id === s.id).length;
              return <button key={s.id} className={`subj ${s.id === subjectId ? 'on' : ''}`} onClick={() => setSubjectId(s.id)}>{s.name}{n > 0 && <span className="subj-n">{n}</span>}</button>;
            })}
          </div>
          <div className="toolbar">
            <button className="btn btn-ghost btn-sm" disabled={!dateInMonth} onClick={newTest}>+ Add {subject?.name} test on {dmy(ctx.date)}</button>
            {!dateInMonth && <span className="txt-err small">Choose a date inside {monthLabel(ctx.month)} {ctx.year} to add a test.</span>}
            <span className="toolbar-spacer" />
            {changes.length > 0 && <span className="dirty-note">{changes.length} unsaved</span>}
            <button className="btn btn-primary btn-sm" disabled={busy || !changes.length} onClick={save}>{busy ? 'Saving…' : isAdmin ? 'Save marks' : 'Save & lock 🔒'}</button>
          </div>
          {!subTests.length ? (
            <div className="empty small-empty">No {subject?.name} test in {monthLabel(ctx.month)} yet. Pick the test date at the top, then click “+ Add test”.</div>
          ) : (
            <div className="grid-wrap">
              <table className="grid">
                <thead>
                  <tr>
                    <th className="sticky-col c-roll">Roll</th><th className="sticky-col c-name">Student</th>
                    {subTests.map((t) => (
                      <th key={t.id} className="c-test">
                        <div className="test-type">{t.test_type}</div>
                        <div className="test-date">{dmy(t.test_date)} · MM {subject?.grade_based ? 'Grade' : fmt(t.max_marks)}</div>
                        {t.topic && <div className="test-topic" title={t.topic}>{t.topic}</div>}
                        {t.teacher_name && <div className="stu-sub">{t.teacher_name}</div>}
                        {isAdmin && (
                          <div className="test-actions">
                            <button className="link-btn" onClick={() => setForm({ ...t, max_marks: t.max_marks == null ? '' : String(Number(t.max_marks)), topic: t.topic || '', teacher_name: t.teacher_name || '' })}>Edit</button>
                            <button className="link-btn txt-err" onClick={() => setDel(t)}>Delete</button>
                          </div>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {students.map((s, r) => (
                    <tr key={s.id}>
                      <td className="sticky-col c-roll">{s.roll_number ?? '–'}</td>
                      <td className="sticky-col c-name"><div className="stu-name">{s.name}</div><div className="stu-sub">Adm {s.admission_number}</div></td>
                      {subTests.map((t, c) => {
                        const k = `${t.id}|${s.id}`;
                        return (
                          <td key={t.id} className="c-test">
                            {editable(k) ? (
                              <input data-nav={`ac-${r}-${c}`} className={`cell ${errors[k] ? 'cell-bad' : ''} ${normStatus(draft[k]) ? 'cell-na' : ''}`}
                                value={draft[k] || ''} maxLength={6} title={errors[k]}
                                onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value.trim() }))}
                                onKeyDown={(e) => onKey(e, r, c)} onFocus={(e) => e.target.select()} />
                            ) : <span className="locked-chip" title={`Saved by ${marks[k].entered_name || ''}`}>{markRaw(marks[k])}</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="sticky-col c-roll" /><td className="sticky-col c-name"><b>Class average</b></td>
                    {subTests.map((t) => {
                      const a = subject?.grade_based ? null : avg(students.map((s) => draft[`${t.id}|${s.id}`] || markRaw(marks[`${t.id}|${s.id}`])).filter((v) => v && !normStatus(v) && !check(t, v)));
                      return <td key={t.id} className="c-test foot-avg">{fmt(a)}</td>;
                    })}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <p className="muted small">Type marks, or <code>Ab</code> absent · <code>NA</code> not applicable · <code>ML</code> medical leave.{subject?.grade_based && ` Grades: ${GRADES.join(' ')}`}</p>
        </div>
      )}

      {form && (
        <Modal title={form.id ? 'Edit test' : `New ${subject?.name} test — ${ctx.classId}`} onClose={() => setForm(null)}
          footer={<><button className="btn btn-ghost" onClick={() => setForm(null)}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={saveTest}>{form.id ? 'Save' : 'Add test'}</button></>}>
          <div className="form-2">
            <Field label="Test date"><input type="date" value={form.test_date} disabled={!isAdmin} onChange={(e) => setForm({ ...form, test_date: e.target.value })} /></Field>
            <Field label="Test type">
              <select value={form.test_type} onChange={(e) => setForm({ ...form, test_type: e.target.value, max_marks: form.id ? form.max_marks : String(defaultMax(e.target.value)) })}>
                {TEST_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Topic / Chapter"><input value={form.topic} placeholder="e.g. Ch 4 Word Meanings" onChange={(e) => setForm({ ...form, topic: e.target.value })} /></Field>
          <div className="form-2">
            {!subject?.grade_based && <Field label="Max marks"><input inputMode="decimal" value={form.max_marks} onChange={(e) => setForm({ ...form, max_marks: e.target.value.replace(/[^0-9.]/g, '') })} /></Field>}
            <Field label="Subject teacher"><input value={form.teacher_name} onChange={(e) => setForm({ ...form, teacher_name: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
      {del && <Confirm danger busy={busy} title="Delete this test?" confirmText="Delete test & marks" message={`${del.test_type} on ${dmy(del.test_date)} (${del.topic || 'no topic'}) and ALL its marks will be deleted.`} onNo={() => setDel(null)} onYes={deleteTest} />}
    </section>
  );
}

export default memo(AcademicCard);
