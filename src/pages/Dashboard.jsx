import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchAll, supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { parseYM, todayStr, ymLabel, ymOf } from '../lib/config';
import { errMsg } from '../lib/util';
import { Empty, Field, Spinner, useToast } from '../components/ui';

const COUNT_ONLY = ['academic', 'hidden_talent', 'music', 'dance', 'art_craft', 'sports'];

export default function Dashboard() {
  const { masters, myClasses, profile, isAdmin } = useAuth();
  const toast = useToast();
  const [ym, setYm] = useState(ymOf(todayStr()));
  const [prog, setProg] = useState({});
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const { session, month } = parseYM(ym);

  const headings = masters.headings.filter((h) => h.is_active);
  const nItems = useMemo(() => {
    const m = {};
    masters.items.filter((i) => i.is_active && i.input_type !== 'video').forEach((i) => { m[i.heading_code] = (m[i.heading_code] || 0) + 1; });
    return m;
  }, [masters.items]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [{ data, error }, st] = await Promise.all([
          supabase.rpc('swot_progress', { p_session: session, p_month: month }),
          fetchAll(() => supabase.from('students').select('class_id').eq('is_active', true)),
        ]);
        if (error) throw error;
        if (!alive) return;
        const p = {};
        data.forEach((r) => { p[`${r.class_id}|${r.heading_code}`] = Number(r.filled); });
        setProg(p);
        const c = {};
        st.forEach((s) => { c[s.class_id] = (c[s.class_id] || 0) + 1; });
        setCounts(c);
      } catch (e) { toast(errMsg(e), 'err'); }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [session, month, toast]);

  const cell = (c, h) => {
    const filled = prog[`${c.id}|${h.code}`] || 0;
    if (COUNT_ONLY.includes(h.code)) return { filled, pct: null };
    const exp = (counts[c.id] || 0) * (nItems[h.code] || 0);
    return { filled, pct: exp ? Math.min(100, Math.round((filled / exp) * 100)) : 0 };
  };

  const rated = headings.filter((h) => !COUNT_ONLY.includes(h.code));
  let totFilled = 0; let totExp = 0;
  myClasses.forEach((c) => rated.forEach((h) => { totFilled += Math.min(prog[`${c.id}|${h.code}`] || 0, (counts[c.id] || 0) * (nItems[h.code] || 0)); totExp += (counts[c.id] || 0) * (nItems[h.code] || 0); }));
  const pct = totExp ? Math.round((totFilled / totExp) * 100) : 0;
  const tests = myClasses.reduce((n, c) => n + (prog[`${c.id}|academic`] || 0), 0);
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
        <Field label="Month - Year"><input type="month" value={ym} onChange={(e) => e.target.value && setYm(e.target.value)} /></Field>
      </div>

      <div className="kpis">
        <div className="kpi"><span>Classes</span><b>{myClasses.length}</b></div>
        <div className="kpi"><span>Students</span><b>{studentsTotal.toLocaleString('en-IN')}</b></div>
        <div className="kpi kpi-accent">
          <span>Ratings filled · {ymLabel(ym)}</span>
          <b>{pct}<small>%</small></b>
          <div className="bar"><i style={{ width: `${pct}%` }} /></div>
        </div>
        <div className="kpi"><span>Tests entered · {ymLabel(ym)}</span><b>{tests}</b></div>
      </div>

      {loading ? <Spinner /> : !myClasses.length ? <Empty icon="🏫" title="No classes assigned yet" /> : (
        <div className="grid-wrap">
          <table className="grid status-grid">
            <thead>
              <tr>
                <th className="sticky-col c-name">Class</th>
                {headings.map((h, i) => <th key={h.code} title={h.name}><span className="vert">{i + 1}. {h.name}</span></th>)}
              </tr>
            </thead>
            <tbody>
              {myClasses.map((c) => (
                <tr key={c.id}>
                  <td className="sticky-col c-name"><Link className="cls-link" to={`/entry?class=${encodeURIComponent(c.id)}&ym=${ym}&date=${ym === ymOf(todayStr()) ? todayStr() : `${ym}-01`}`}><b>{c.id}</b></Link><div className="stu-sub">{counts[c.id] || 0} students</div></td>
                  {headings.map((h) => {
                    const { filled, pct: p } = cell(c, h);
                    return (
                      <td key={h.code} className="dot-cell">
                        {p === null
                          ? <span className={`count-chip ${filled ? 'band-high' : 'band-low'}`}>{filled}</span>
                          : <span className={`pct-chip ${p >= 100 ? 'full' : p > 0 ? 'part' : 'none'}`}>{p}%</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small">% = boxes filled for the month. Numbers (Academic, Hidden Talent, Music, Dance, Art &amp; Craft, Sports) = entries made. Click a class to open its SWOT sheet for that month.</p>
    </div>
  );
}
