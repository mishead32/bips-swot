import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchAll, supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { MONTHS, SCHOOL_NAME, SCHOOL_PLACE, SESSIONS, band, talentLevel } from '../lib/config';
import { errMsg, fmt, sortStudents } from '../lib/util';
import { ClassSelect } from '../components/Pickers';
import { Empty, Field, Spinner, useToast } from '../components/ui';
import { display } from './entry/cells';

const dm = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '');
const short = (t) => t.replace('Weekly Test', 'WT').replace('Periodic Test', 'PT').replace('Half Yearly Exam', 'Half Yearly').replace('Revision Test', 'Rev. Test');

export default function StudentSheet() {
  const { masters, myClasses } = useAuth();
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const session = sp.get('session') || SESSIONS[0];
  const urlClass = sp.get('class');
  const classId = urlClass && myClasses.some((c) => c.id === urlClass) ? urlClass : (myClasses.length === 1 ? myClasses[0].id : '');
  const studentId = sp.get('student') || '';
  const set = (o) => { const n = new URLSearchParams(sp); Object.entries(o).forEach(([k, v]) => (v ? n.set(k, v) : n.delete(k))); setSp(n, { replace: true }); };

  const [students, setStudents] = useState([]);
  const [student, setStudent] = useState(null);
  const [vals, setVals] = useState([]);
  const [tests, setTests] = useState([]);
  const [marks, setMarks] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!classId) return;
    supabase.from('students').select('id,name,admission_number,roll_number').eq('class_id', classId).eq('is_active', true)
      .then(({ data }) => setStudents(sortStudents(data || [])));
  }, [classId]);

  useEffect(() => {
    if (!studentId) { setStudent(null); return; }
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const { data: st, error } = await supabase.from('students').select('*').eq('id', studentId).maybeSingle();
        if (error) throw error;
        const v = await fetchAll(() => supabase.from('swot_values').select('*').eq('student_id', studentId).eq('session', session).order('id'));
        const { data: t, error: e2 } = await supabase.from('academic_tests').select('*').eq('session', session).eq('class_id', st?.class_id || classId).order('test_date');
        if (e2) throw e2;
        const m = {};
        if (t.length) {
          const { data: mk, error: e3 } = await supabase.from('academic_marks').select('*').eq('student_id', studentId).in('test_id', t.map((x) => x.id));
          if (e3) throw e3;
          mk.forEach((r) => { m[r.test_id] = r; });
        }
        if (!alive) return;
        setStudent(st); setVals(v); setTests(t); setMarks(m);
      } catch (e) { toast(errMsg(e), 'err'); }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [studentId, session, classId, toast]);

  const byItem = useMemo(() => {
    const m = {};
    vals.forEach((r) => { (m[r.item_id] ||= {})[r.month] = r; });
    return m;
  }, [vals]);

  const idx = students.findIndex((s) => s.id === studentId);
  const headings = masters.headings.filter((h) => h.is_active);
  const items = (code) => masters.items.filter((i) => i.heading_code === code && i.is_active);
  const cls = masters.classes.find((c) => c.id === student?.class_id);

  const monthHead = (
    <tr>
      <th className="sh-label" />
      {MONTHS.map((m) => <th key={m.n}>{m.short}{m.tag && <div className="sh-tag">{m.tag}</div>}</th>)}
    </tr>
  );

  const scoreTable = (list) => (
    <table className="sh-table">
      <thead>{monthHead}</thead>
      <tbody>
        {list.map((it, i) => (
          <tr key={it.id}>
            <td className="sh-label">{list.length > 1 && <span className="sh-letter">{String.fromCharCode(97 + i)}</span>}{it.name}</td>
            {MONTHS.map((m) => {
              const r = byItem[it.id]?.[m.n];
              return <td key={m.n} className={r && it.input_type === 'score10' ? band(r.value_num) : ''}>{r ? display(it.input_type, r) : ''}</td>;
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );

  const videoTable = (list) => (
    <table className="sh-table">
      <thead>{monthHead}</thead>
      <tbody>
        {list.map((it) => (
          <tr key={it.id}>
            <td className="sh-label">{it.name}</td>
            {MONTHS.map((m) => {
              const r = byItem[it.id]?.[m.n];
              return <td key={m.n}>{r && <a href={r.value_text} target="_blank" rel="noreferrer" className="sh-link">▶ {r.value_text2 || 'Video'}</a>}</td>;
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );

  const talentTable = (list) => {
    const used = list.filter((it) => byItem[it.id]);
    if (!used.length) return <div className="sh-none">No entry yet. ({list.map((i) => i.name).join(', ')})</div>;
    return (
      <table className="sh-table">
        <thead>{monthHead}</thead>
        <tbody>
          {used.map((it) => (
            <tr key={it.id}>
              <td className="sh-label">{it.group_name ? `${it.group_name} – ` : ''}{it.name}</td>
              {MONTHS.map((m) => {
                const r = byItem[it.id]?.[m.n];
                if (!r) return <td key={m.n} />;
                return <td key={m.n} className="band-high">{it.input_type === 'level10' ? <>{fmt(r.value_num)}<div className="sh-tag">{talentLevel(r.value_num)}</div></> : <span className="sh-small">{r.value_text}</span>}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  const academicTable = () => {
    const subIds = [...new Set(tests.map((t) => t.subject_id))];
    if (!subIds.length) return <div className="sh-none">No tests entered yet.</div>;
    const subs = masters.subjects.filter((s) => subIds.includes(s.id));
    return (
      <table className="sh-table sh-acad">
        <thead>{monthHead}</thead>
        <tbody>
          {subs.map((s) => {
            const teacher = tests.find((t) => t.subject_id === s.id && t.teacher_name)?.teacher_name;
            return (
              <tr key={s.id}>
                <td className="sh-label">{s.name}{teacher && <div className="sh-tag">({teacher})</div>}</td>
                {MONTHS.map((m) => {
                  const list = tests.filter((t) => t.subject_id === s.id && t.month === m.n);
                  return (
                    <td key={m.n} className="sh-tests">
                      {list.map((t) => {
                        const mk = marks[t.id];
                        const val = !mk ? '–' : mk.status !== 'P' ? mk.status : mk.grade || `${fmt(mk.marks)}/${fmt(t.max_marks)}`;
                        const pct = mk && mk.status === 'P' && mk.marks != null && t.max_marks ? (mk.marks / t.max_marks) * 100 : null;
                        return (
                          <div key={t.id} className="sh-test" title={`${t.test_type} · ${t.topic || ''}`}>
                            <span className="sh-tt">{dm(t.test_date)} {short(t.test_type)}</span>
                            <b className={pct == null ? '' : pct >= 70 ? 'txt-ok' : pct < 40 ? 'txt-err' : ''}>{val}</b>
                            {t.topic && <span className="sh-topic">{t.topic}</span>}
                          </div>
                        );
                      })}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  };

  const singleRow = (code) => {
    const it = items(code)[0];
    if (!it) return null;
    return MONTHS.map((m) => {
      const r = byItem[it.id]?.[m.n];
      const t = r ? display(it.input_type, r) : '';
      return <td key={m.n} className={t === 'Paid' || t === 'P' ? 'band-high' : t === 'Pending' || t === 'A' ? 'band-low' : ''}>{t}</td>;
    });
  };

  return (
    <div className="page">
      <div className="filters card no-print filters-4">
        <Field label="Session"><select value={session} onChange={(e) => set({ session: e.target.value })}>{SESSIONS.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Class"><ClassSelect classes={myClasses} value={classId} onChange={(v) => set({ class: v, student: '' })} /></Field>
        <Field label="Student">
          <select value={studentId} onChange={(e) => set({ student: e.target.value })} disabled={!classId}>
            <option value="">— Select student —</option>
            {students.map((s) => <option key={s.id} value={s.id}>{s.roll_number ? `${s.roll_number}. ` : ''}{s.name}</option>)}
          </select>
        </Field>
        <div className="row-gap sheet-btns">
          <button className="btn btn-ghost btn-sm" disabled={idx <= 0} onClick={() => set({ student: students[idx - 1].id })}>◀ Prev</button>
          <button className="btn btn-ghost btn-sm" disabled={idx < 0 || idx >= students.length - 1} onClick={() => set({ student: students[idx + 1].id })}>Next ▶</button>
          <button className="btn btn-primary btn-sm" disabled={!student} onClick={() => window.print()}>🖨 Print / PDF</button>
        </div>
      </div>

      {!studentId ? <Empty icon="📄" title="Select class and student to view the SWOT sheet" /> : loading || !student ? <Spinner /> : (
        <div className="sheet">
          <div className="sh-head">
            <div className="brand-mark">B</div>
            <div>
              <div className="sh-school">{SCHOOL_NAME}</div>
              <div className="sh-addr">{SCHOOL_PLACE}</div>
              <div className="sh-title">SWOT Analysis Through Observation &amp; Evaluation To Nurture Our Child</div>
            </div>
          </div>
          <div className="sh-info">
            <div><span>Admission No</span><b>{student.admission_number}</b></div>
            <div><span>Name of the child</span><b>{student.name}</b></div>
            <div><span>Father's Name</span><b>{student.father_name || '—'}</b></div>
            <div><span>Mobile No.</span><b>{student.parent_contact || '—'}</b></div>
            <div><span>House</span><b>{student.house || '—'}</b></div>
            <div><span>Class &amp; Section</span><b>{cls ? `${cls.grade} ${cls.section}`.toUpperCase() : student.class_id}</b></div>
            <div><span>Session</span><b>{session}</b></div>
            <div><span>Roll No</span><b>{student.roll_number ?? '—'}</b></div>
          </div>

          {headings.map((h, i) => {
            const n = i + 1;
            if (['attendance', 'fee', 'ptm'].includes(h.code)) {
              if (h.code !== 'attendance') return null;
              const trio = headings.filter((x) => ['attendance', 'fee', 'ptm'].includes(x.code));
              return (
                <div key="trio" className="sh-sec">
                  <table className="sh-table">
                    <thead>{monthHead}</thead>
                    <tbody>
                      {trio.map((x) => (
                        <tr key={x.code}><td className="sh-label"><b>{headings.indexOf(x) + 1}. {x.name}</b></td>{singleRow(x.code)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            }
            const list = items(h.code);
            let body;
            if (h.code === 'academic') body = academicTable();
            else if (['music', 'dance', 'art_craft', 'sports'].includes(h.code)) body = talentTable(list);
            else if (h.code === 'hidden_talent') body = videoTable(list);
            else {
              const sc = list.filter((x) => x.input_type !== 'video');
              const vd = list.filter((x) => x.input_type === 'video');
              body = <>{sc.length > 0 && scoreTable(sc)}{vd.length > 0 && <><div className="sh-sub">Video links</div>{videoTable(vd)}</>}</>;
            }
            return (
              <div key={h.code} className="sh-sec">
                <div className="sh-h"><span>{n}.</span> {h.name}{h.scale_note && <em> — {h.scale_note.length > 120 ? h.scale_note.slice(0, 118) + '…' : h.scale_note}</em>}</div>
                {body}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
