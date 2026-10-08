import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { parseYM } from '../lib/config';
import { downloadCSV, errMsg, fmt, sortStudents } from '../lib/util';
import { ClassSelect } from '../components/Pickers';
import { Empty, Field, Spinner, useToast } from '../components/ui';
import PeriodFilter, { defaultPeriod, periodRange } from '../components/PeriodFilter';
import AvgTable from '../components/AvgTable';

export default function ClassReport() {
  const { masters, myClasses } = useAuth();
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const urlClass = sp.get('class');
  const classId = urlClass && myClasses.some((c) => c.id === urlClass) ? urlClass : (myClasses.length === 1 ? myClasses[0].id : '');
  const [period, setPeriod] = useState(defaultPeriod);
  const range = periodRange(period);
  const [students, setStudents] = useState([]);
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const headings = masters.headings.filter((h) => h.is_active);

  useEffect(() => {
    if (!classId) return;
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [st, { data: rows, error }] = await Promise.all([
          supabase.from('students').select('id,name,admission_number,roll_number').eq('class_id', classId).eq('is_active', true),
          supabase.rpc('swot_avg', { p_from: range.from, p_to: range.to, p_class: classId }),
        ]);
        if (st.error) throw st.error;
        if (error) throw error;
        if (!alive) return;
        setStudents(sortStudents(st.data));
        const d = {};
        rows.forEach((r) => { d[`${r.student_id}|${r.heading_code}`] = r; });
        setData(d);
      } catch (e) { toast(errMsg(e), 'err'); }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [classId, range.from, range.to, toast]);

  // class average row on top
  const classRow = useMemo(() => {
    const out = {};
    headings.forEach((h) => {
      const rs = students.map((s) => data[`${s.id}|${h.code}`]).filter(Boolean);
      if (!rs.length) return;
      if (h.code === 'academic') {
        const a = rs.reduce((x, r) => x + Number(r.achieved || 0), 0);
        const p = rs.reduce((x, r) => x + Number(r.planned || 0), 0);
        out[`__class|${h.code}`] = { achieved: a, planned: p, avg_score: p ? (a / p) * 100 : 0, entries: rs.length };
      } else if (h.code === 'attendance') {
        const v = rs.map((r) => Number(r.att_pct)).filter((x) => !Number.isNaN(x));
        out[`__class|${h.code}`] = { att_pct: v.length ? v.reduce((x, y) => x + y, 0) / v.length : null, entries: rs.length };
      } else {
        const v = rs.map((r) => r.avg_score).filter((x) => x != null).map(Number);
        out[`__class|${h.code}`] = { avg_score: v.length ? v.reduce((x, y) => x + y, 0) / v.length : null, entries: rs.reduce((x, r) => x + Number(r.entries), 0) };
      }
    });
    return out;
  }, [students, data, headings]);

  const shown = students.filter((s) => `${s.name} ${s.admission_number}`.toLowerCase().includes(q.toLowerCase()));
  const sheetLink = (sid) => `/sheet?class=${encodeURIComponent(classId)}&student=${sid}&session=${parseYM(range.from.slice(0, 7)).session}`;

  function exportCSV() {
    const head = ['Roll', 'Adm No', 'Student', ...headings.map((h, i) => `${i + 1}. ${h.name}`)];
    const cell = (r, code) => {
      if (!r) return '';
      if (code === 'academic') return `${fmt(r.achieved)}/${fmt(r.planned)} (${fmt(r.avg_score, 1)}%)`;
      if (code === 'attendance') return `${fmt(r.att_pct, 1)}%`;
      return r.avg_score != null ? fmt(r.avg_score) : `${r.entries} entries`;
    };
    const rows = students.map((s) => [s.roll_number ?? '', s.admission_number, s.name, ...headings.map((h) => cell(data[`${s.id}|${h.code}`], h.code))]);
    downloadCSV(`Class_Report_${classId}_${range.label}.csv`, [['Class', classId], ['Period', range.label], [], head, ...rows]);
  }

  return (
    <div className="page">
      <div className="card report-filters">
        <Field label="Class"><ClassSelect classes={myClasses} value={classId} onChange={(v) => setSp({ class: v }, { replace: true })} /></Field>
        <Field label="Period"><PeriodFilter value={period} onChange={setPeriod} /></Field>
      </div>

      {!classId ? <Empty icon="👆" title="Select a class to see the student-wise report" /> : loading ? <Spinner /> : (
        <>
          <div className="sheet-head">
            <h2 className="sheet-title">{classId} <span className="muted">· {range.label} · {students.length} students</span></h2>
            <div className="row-gap">
              <input className="search" placeholder="Find student…" value={q} onChange={(e) => setQ(e.target.value)} />
              <button className="btn btn-ghost btn-sm" onClick={exportCSV}>⬇ Download CSV</button>
            </div>
          </div>
          <AvgTable
            firstCol="Student"
            headings={headings}
            data={{ ...data, ...classRow }}
            rows={[
              { key: '__class', label: 'CLASS AVERAGE', sub: classId },
              ...shown.map((s) => ({ key: s.id, label: `${s.roll_number ? s.roll_number + '. ' : ''}${s.name}`, sub: `Adm ${s.admission_number}`, to: sheetLink(s.id) })),
            ]}
          />
          <p className="muted small">Average marks out of 10 for each heading in the chosen period. Academic = marks got / planned marks. Click a student's name to open the full SWOT sheet.</p>
        </>
      )}
    </div>
  );
}
