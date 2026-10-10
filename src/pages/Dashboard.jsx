import { useEffect, useState } from 'react';
import { fetchAll, supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { errMsg, fmt } from '../lib/util';
import { Link } from 'react-router-dom';
import { Empty, Spinner, useToast } from '../components/ui';
import PeriodFilter, { defaultPeriod, periodRange } from '../components/PeriodFilter';
import AvgTable from '../components/AvgTable';

export default function Dashboard() {
  const { masters, myClasses, profile, isAdmin, isHod } = useAuth();
  const [evals, setEvals] = useState([]);
  const toast = useToast();
  const [period, setPeriod] = useState(defaultPeriod);
  const [data, setData] = useState({});
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const range = periodRange(period);
  const headings = masters.headings.filter((h) => h.is_active);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [{ data: rows, error }, st] = await Promise.all([
          supabase.rpc('swot_avg', { p_from: range.from, p_to: range.to }),
          fetchAll(() => supabase.from('students').select('class_id').eq('is_active', true)),
        ]);
        if (error) throw error;
        const ev = await supabase.from('evaluations').select('form_code,total,max_total').gte('eval_date', range.from).lte('eval_date', range.to);
        if (!alive) return;
        setEvals(ev.data || []);
        const d = {};
        rows.forEach((r) => { d[`${r.class_id}|${r.heading_code}`] = r; });
        setData(d);
        const c = {};
        st.forEach((s) => { c[s.class_id] = (c[s.class_id] || 0) + 1; });
        setCounts(c);
      } catch (e) { toast(errMsg(e), 'err'); }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [range.from, range.to, toast]);

  // overall numbers for the KPI boxes
  const vals = Object.entries(data).filter(([k]) => myClasses.some((c) => k.startsWith(`${c.id}|`)));
  const scoreAvg = (() => {
    const s = vals.filter(([k, r]) => r.avg_score != null && !k.endsWith('|academic')).map(([, r]) => Number(r.avg_score));
    return s.length ? s.reduce((a, b) => a + b, 0) / s.length : null;
  })();
  const acad = vals.filter(([k]) => k.endsWith('|academic')).reduce((a, [, r]) => ({ got: a.got + Number(r.achieved || 0), max: a.max + Number(r.planned || 0) }), { got: 0, max: 0 });
  const studentsTotal = myClasses.reduce((n, c) => n + (counts[c.id] || 0), 0);
  const hour = new Date().getHours();

  return (
    <div className="page">
      <div className="hero">
        <div>
          <div className="hero-hi">{hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'},</div>
          <h1 className="hero-name">{profile.name}</h1>
          <div className="muted">{isAdmin ? 'Admin view — all classes' : `Your classes: ${myClasses.map((c) => c.id).join(', ') || 'none assigned yet'}`}</div>
        </div>
        <PeriodFilter value={period} onChange={setPeriod} />
      </div>

      <div className="kpis">
        <div className="kpi"><span>Classes</span><b>{myClasses.length}</b></div>
        <div className="kpi"><span>Students</span><b>{studentsTotal.toLocaleString('en-IN')}</b></div>
        <div className="kpi kpi-accent"><span>Average SWOT rating · {range.label}</span><b>{fmt(scoreAvg)}<small> / 10</small></b></div>
        <div className="kpi"><span>Academic marks · {range.label}</span><b>{acad.max ? `${fmt((acad.got / acad.max) * 100, 1)}%` : '–'}</b>{acad.max > 0 && <span>{fmt(acad.got)} got of {fmt(acad.max)} planned</span>}</div>
      </div>

      {masters.evalForms.length > 0 && (
        <div className="eval-strip">
          {masters.evalForms.map((f) => {
            const list = evals.filter((e) => e.form_code === f.code);
            const a = list.length ? list.reduce((x, e) => x + Number(e.total), 0) / list.length : null;
            return (
              <Link key={f.code} to={`/eval-reports?form=${f.code}`} className="eval-tile">
                <span className="et-name">Teachers · {f.name}</span>
                <b>{a == null ? '–' : `${fmt(a)} / ${fmt(f.max_total)}`}</b>
                <span className="et-sub">{list.length} evaluation(s) · {range.label}{!isHod ? ' (yours)' : ''}</span>
              </Link>
            );
          })}
        </div>
      )}

      {loading ? <Spinner /> : !myClasses.length ? <Empty icon="🏫" title="No classes assigned yet" /> : (
        <AvgTable
          headings={headings}
          data={data}
          rows={myClasses.map((c) => ({ key: c.id, label: c.id, sub: `${counts[c.id] || 0} students`, to: `/report?class=${encodeURIComponent(c.id)}` }))}
        />
      )}
      <p className="muted small">Each box = class <b>average marks out of 10</b> for that heading in {range.label}. Academic = total marks got / total planned marks. Click a class to see every student.</p>
    </div>
  );
}
