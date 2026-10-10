import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { todayStr } from '../../lib/config';
import { errMsg, fmt } from '../../lib/util';
import { ClassSelect } from '../../components/Pickers';
import { Confirm, Empty, Field, useToast } from '../../components/ui';
import { evalGrade, gradeClass, sections } from './evalUtil';

const blank = () => ({ eval_date: todayStr(), teacher_id: '', teacher_name: '', class_id: '', subject: '', topic: '', remarks: '', scores: {} });

export default function EvalForm() {
  const { code } = useParams();
  const { masters, profile, isHod } = useAuth();
  const toast = useToast();
  const form = masters.evalForms.find((f) => f.code === code);
  const criteria = useMemo(() => masters.evalCriteria.filter((c) => c.form_code === code && c.is_active), [masters.evalCriteria, code]);
  const secs = sections(criteria);
  const [staff, setStaff] = useState([]);
  const [f, setF] = useState(blank);
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  useEffect(() => { setF(blank()); setDone(null); }, [code]);
  useEffect(() => {
    supabase.rpc('list_staff').then(({ data }) => setStaff((data || []).filter((s) => s.role !== 'admin' || true)));
  }, []);

  if (!isHod) return <Empty icon="🔒" title="Only HODs and Admin can fill teacher evaluations" />;
  if (!form) return <Empty title="Form not found" />;

  const total = Object.values(f.scores).reduce((a, s) => a + (s.marks ?? 0), 0);
  const answered = criteria.filter((c) => f.scores[c.id]?.marks != null).length;
  const grade = evalGrade(code, total, form.max_total);
  const setScore = (cid, o) => setF((x) => ({ ...x, scores: { ...x.scores, [cid]: { ...x.scores[cid], ...o } } }));

  function check() {
    if (!f.eval_date) return 'Choose the date';
    if (!f.teacher_name.trim()) return 'Choose the teacher';
    if (answered < criteria.length) return `${criteria.length - answered} parameter(s) not marked yet`;
    return '';
  }

  async function submit() {
    setBusy(true);
    const payload = {
      form_code: code, eval_date: f.eval_date, teacher_id: f.teacher_id || null, teacher_name: f.teacher_name.trim(),
      class_id: f.class_id || null, subject: f.subject || null, topic: f.topic || null, remarks: f.remarks || null, scores: f.scores,
    };
    const { data, error } = await supabase.from('evaluations').insert(payload).select().single();
    setBusy(false);
    setAsk(false);
    if (error) return toast(errMsg(error), 'err');
    toast(`${form.name} saved for ${f.teacher_name} — ${fmt(data.total)}/${fmt(data.max_total)} ✔`);
    setDone(data);
  }

  if (done) {
    const g = evalGrade(code, done.total, done.max_total);
    return (
      <div className="page">
        <div className="card done-card">
          <div className="done-tick">✔</div>
          <h2>{form.name} submitted &amp; locked</h2>
          <p className="muted">{done.teacher_name} · {done.eval_date}</p>
          <div className={`done-score ${gradeClass(g)}`}>{fmt(done.total)} / {fmt(done.max_total)}<small>{g}</small></div>
          <div className="row-gap" style={{ justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={() => { setF(blank()); setDone(null); }}>+ New {form.name}</button>
            <Link className="btn btn-ghost" to={`/eval-reports?form=${code}`}>View reports</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="card eval-head">
        <div className="eval-title">
          <h2>{code === 'notebook' ? 'NOTEBOOK INSPECTION SHEET' : 'PEDAGOGY SHEET'}</h2>
          <span className="muted small">{form.grade_note}</span>
        </div>
        <div className="eval-fields">
          <Field label={code === 'notebook' ? 'Date of inspection' : 'Date'}><input type="date" value={f.eval_date} onChange={(e) => setF({ ...f, eval_date: e.target.value })} /></Field>
          <Field label={code === 'notebook' ? 'Teacher name' : 'Pedagogy score given to (teacher)'}>
            <input list="staff-list" value={f.teacher_name} placeholder="Type or pick teacher"
              onChange={(e) => {
                const v = e.target.value;
                const m = staff.find((s) => s.name === v);
                setF({ ...f, teacher_name: v, teacher_id: m ? m.id : '' });
              }} />
            <datalist id="staff-list">{staff.map((s) => <option key={s.id} value={s.name}>{s.email}</option>)}</datalist>
          </Field>
          <Field label="Class / Section"><ClassSelect classes={masters.classes.filter((c) => c.is_active)} value={f.class_id} onChange={(v) => setF({ ...f, class_id: v })} /></Field>
          <Field label="Subject"><input value={f.subject} placeholder="e.g. English and Maths" onChange={(e) => setF({ ...f, subject: e.target.value })} /></Field>
          {code === 'pedagogy' && <Field label="Topic / Concept"><input value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} /></Field>}
          <Field label={code === 'notebook' ? 'Re-checked by' : 'Pedagogy score given by'}><input value={profile.name} disabled /></Field>
        </div>
      </div>

      {secs.map((s) => (
        <section key={s.name} className="hcard eval-sec">
          <header className="hcard-head"><div className="hcard-title"><h3>{s.name}</h3></div>
            <span className="hcount">{fmt(s.items.reduce((a, c) => a + (f.scores[c.id]?.marks ?? 0), 0))} / {fmt(s.items.reduce((a, c) => a + Math.max(...c.options.map((o) => o.marks)), 0))}</span>
          </header>
          <div className="hcard-body">
            {code === 'pedagogy' ? (
              <table className="grid eval-grid">
                <thead><tr><th>Parameter</th><th className="c-opts">Marks (0–2)</th><th>Remarks</th></tr></thead>
                <tbody>
                  {s.items.map((c) => (
                    <tr key={c.id}>
                      <td className="eval-param">{c.name}</td>
                      <td className="c-opts">
                        <div className="opt-row">
                          {c.options.map((o) => (
                            <button key={o.label} type="button" className={`opt ${f.scores[c.id]?.marks === o.marks ? `on m${o.marks}` : ''}`} onClick={() => setScore(c.id, { marks: o.marks, label: o.label })}>{o.label}</button>
                          ))}
                        </div>
                      </td>
                      <td><input className="cell-txt" placeholder="Remarks (optional)" value={f.scores[c.id]?.remark || ''} onChange={(e) => setScore(c.id, { remark: e.target.value })} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              s.items.map((c) => (
                <div key={c.id} className="nb-options">
                  {c.options.map((o) => (
                    <label key={o.label} className={`nb-opt ${f.scores[c.id]?.label === o.label ? 'on' : ''}`}>
                      <input type="radio" name={`c${c.id}`} checked={f.scores[c.id]?.label === o.label} onChange={() => setScore(c.id, { marks: o.marks, label: o.label })} />
                      <span className="nb-label">{o.label}</span>
                      <span className="nb-marks">{o.marks}</span>
                    </label>
                  ))}
                </div>
              ))
            )}
          </div>
        </section>
      ))}

      <div className="card">
        <Field label={code === 'notebook' ? 'Inspector remarks' : 'Overall remarks'}>
          <textarea rows={3} value={f.remarks} onChange={(e) => setF({ ...f, remarks: e.target.value })} />
        </Field>
      </div>

      <div className="savebar">
        <div className="savebar-info">
          <b>TOTAL SCORE: {fmt(total)} / {fmt(form.max_total)}</b>
          <span className={`pill ${gradeClass(grade)}`} style={{ marginLeft: 10 }}>{grade}</span>
          <span className="muted"> · {answered}/{criteria.length} marked</span>
        </div>
        <button className="btn btn-primary" disabled={busy} onClick={() => { const e = check(); if (e) toast(e, 'err'); else setAsk(true); }}>Submit &amp; lock 🔒</button>
      </div>

      {ask && (
        <Confirm title={`Submit ${form.name}?`} busy={busy} confirmText="Yes, submit"
          message={<><b>{f.teacher_name}</b> · {f.eval_date}<br />Total <b>{fmt(total)} / {fmt(form.max_total)}</b> ({grade})<br /><br />After submitting it cannot be changed. Only the Admin can edit or delete.</>}
          onNo={() => setAsk(false)} onYes={submit} />
      )}
    </div>
  );
}
