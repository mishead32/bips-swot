import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchAll, supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { downloadCSV, errMsg, fmt } from '../../lib/util';
import { Confirm, Empty, Modal, Spinner, useToast } from '../../components/ui';
import PeriodFilter, { defaultPeriod, periodRange } from '../../components/PeriodFilter';
import { dmyFull, evalGrade, gradeClass, sections } from './evalUtil';

export function EvalSheet({ ev, form, criteria }) {
  const secs = sections(criteria);
  const g = evalGrade(ev.form_code, ev.total, ev.max_total);
  return (
    <div className="eval-sheet">
      <div className="sh-head">
        <img className="sh-logo" src="/logo.png" alt="BIPS" />
        <div><div className="sh-school">Bhupindra International Public School</div><div className="sh-title">{ev.form_code === 'notebook' ? 'NOTEBOOK INSPECTION SHEET' : 'PEDAGOGY SHEET'}</div></div>
      </div>
      <div className="sh-info">
        <div><span>Date</span><b>{dmyFull(ev.eval_date)}</b></div>
        <div><span>Teacher</span><b>{ev.teacher_name}</b></div>
        <div><span>Class / Section</span><b>{ev.class_id || '—'}</b></div>
        <div><span>Subject</span><b>{ev.subject || '—'}</b></div>
        {ev.form_code === 'pedagogy' && <div><span>Topic / Concept</span><b>{ev.topic || '—'}</b></div>}
        <div><span>{ev.form_code === 'notebook' ? 'Re-checked by' : 'Score given by'}</span><b>{ev.evaluator_name || '—'}</b></div>
      </div>
      {secs.map((s) => (
        <div key={s.name} className="sh-sec">
          <div className="sh-h">{s.name}</div>
          <table className="sh-table">
            <thead><tr><th className="sh-label">{ev.form_code === 'notebook' ? 'Criteria' : 'Parameter'}</th><th style={{ width: 90 }}>Marks</th><th>{ev.form_code === 'notebook' ? 'Selected' : 'Remarks'}</th></tr></thead>
            <tbody>
              {ev.form_code === 'notebook'
                ? s.items.map((c) => c.options.map((o) => {
                  const on = ev.scores[c.id]?.label === o.label;
                  return <tr key={c.id + o.label} className={on ? 'nb-picked' : ''}><td className="sh-label">{o.label}</td><td>{o.marks}</td><td>{on ? '✔' : ''}</td></tr>;
                }))
                : s.items.map((c) => (
                  <tr key={c.id}><td className="sh-label">{c.name}</td><td className={ev.scores[c.id]?.marks === 2 ? 'band-high' : ev.scores[c.id]?.marks === 1 ? 'band-mid' : 'band-low'}>{ev.scores[c.id]?.marks ?? '–'}</td><td style={{ textAlign: 'left' }}>{ev.scores[c.id]?.remark || ''}</td></tr>
                ))}
            </tbody>
          </table>
        </div>
      ))}
      <div className={`eval-total ${gradeClass(g)}`}>TOTAL SCORE: {fmt(ev.total)} / {fmt(ev.max_total)} <span>· {g}</span></div>
      {form?.grade_note && <div className="muted small">{form.grade_note}</div>}
      {ev.remarks && <div className="eval-remarks"><b>{ev.form_code === 'notebook' ? 'Inspector Remarks' : 'Remarks'}:</b> {ev.remarks}</div>}
    </div>
  );
}

export default function EvalReports() {
  const { masters, isAdmin, isHod } = useAuth();
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const code = sp.get('form') || 'pedagogy';
  const form = masters.evalForms.find((f) => f.code === code);
  const criteria = useMemo(() => masters.evalCriteria.filter((c) => c.form_code === code), [masters.evalCriteria, code]);
  const secs = sections(criteria.filter((c) => c.is_active));
  const [period, setPeriod] = useState(() => ({ ...defaultPeriod(), mode: 'range', from: `${new Date().getFullYear() - (new Date().getMonth() < 3 ? 1 : 0)}-04-01` }));
  const range = periodRange(period);
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(null);
  const [view, setView] = useState(null);
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    setRows(null);
    try {
      const data = await fetchAll(() => supabase.from('evaluations').select('*').eq('form_code', code)
        .gte('eval_date', range.from).lte('eval_date', range.to).order('eval_date', { ascending: false }));
      setRows(data);
    } catch (e) { toast(errMsg(e), 'err'); setRows([]); }
  }, [code, range.from, range.to, toast]);
  useEffect(() => { load(); }, [load]);

  // teacher-wise summary
  const summary = useMemo(() => {
    if (!rows) return [];
    const m = {};
    rows.forEach((r) => {
      const k = r.teacher_id || r.teacher_name.toLowerCase();
      const t = (m[k] ||= { key: k, name: r.teacher_name, list: [], sec: {} });
      t.list.push(r);
      secs.forEach((s) => {
        const got = s.items.reduce((a, c) => a + (r.scores[c.id]?.marks ?? 0), 0);
        (t.sec[s.name] ||= []).push(got);
      });
    });
    return Object.values(m).map((t) => {
      const tot = t.list.map((r) => Number(r.total));
      const avg = tot.reduce((a, b) => a + b, 0) / tot.length;
      return { ...t, count: t.list.length, avg, last: t.list[0].eval_date, secAvg: Object.fromEntries(Object.entries(t.sec).map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / v.length])) };
    }).sort((a, b) => a.name.localeCompare(b.name));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, criteria]);

  const shown = summary.filter((t) => t.name.toLowerCase().includes(q.toLowerCase()));
  const max = Number(form?.max_total || 0);
  const overall = rows && rows.length ? rows.reduce((a, r) => a + Number(r.total), 0) / rows.length : null;
  const secMax = (s) => s.items.reduce((a, c) => a + Math.max(...c.options.map((o) => o.marks)), 0);

  async function remove() {
    setBusy(true);
    const { error } = await supabase.from('evaluations').delete().eq('id', del.id);
    setBusy(false);
    if (error) return toast(errMsg(error), 'err');
    toast('Deleted');
    setDel(null);
    load();
  }

  function exportCSV() {
    const head = ['Date', 'Teacher', 'Class', 'Subject', ...(code === 'pedagogy' ? ['Topic'] : []), 'Given by', ...criteria.map((c) => (code === 'notebook' ? c.name : c.name)), 'Total', 'Max', 'Grade', 'Remarks'];
    const body = (rows || []).map((r) => [r.eval_date, r.teacher_name, r.class_id || '', r.subject || '', ...(code === 'pedagogy' ? [r.topic || ''] : []), r.evaluator_name || '', ...criteria.map((c) => r.scores[c.id]?.marks ?? ''), r.total, r.max_total, evalGrade(code, r.total, r.max_total), r.remarks || '']);
    downloadCSV(`${form.name}_${range.label}.csv`, [head, ...body]);
  }

  return (
    <div className="page">
      <div className="tabs">
        {masters.evalForms.map((f) => <button key={f.code} className={`tab ${f.code === code ? 'tab-on' : ''}`} onClick={() => { setSp({ form: f.code }, { replace: true }); setOpen(null); }}>{f.name}</button>)}
      </div>
      <div className="card report-filters">
        <div>
          <div className="fi-big">{form?.name} report</div>
          <div className="muted small">{isHod ? 'All teachers' : 'Your own evaluations'} · {range.label}</div>
        </div>
        <PeriodFilter value={period} onChange={setPeriod} />
      </div>

      {!rows ? <Spinner /> : !rows.length ? <Empty icon="📝" title={`No ${form?.name} entries in this period`} /> : (
        <>
          <div className="kpis">
            <div className="kpi"><span>Evaluations</span><b>{rows.length}</b></div>
            <div className="kpi"><span>Teachers evaluated</span><b>{summary.length}</b></div>
            <div className="kpi kpi-accent"><span>Average score</span><b>{fmt(overall)}<small> / {fmt(max)}</small></b></div>
            <div className="kpi"><span>Average %</span><b>{fmt((overall / max) * 100, 1)}%</b></div>
          </div>
          <div className="toolbar">
            <input className="search" placeholder="Find teacher…" value={q} onChange={(e) => setQ(e.target.value)} />
            <span className="toolbar-spacer" />
            <button className="btn btn-ghost btn-sm" onClick={exportCSV}>⬇ Download CSV</button>
          </div>
          <div className="grid-wrap">
            <table className="grid list-grid eval-sum">
              <thead>
                <tr>
                  <th>Teacher</th><th>Times evaluated</th>
                  {secs.map((s) => <th key={s.name} className="wrap-th">{s.name.replace(/\s*\(.*\)/, '')}<div className="stu-sub">avg / {secMax(s)}</div></th>)}
                  <th>Average total</th><th>Grade</th><th>Last</th><th />
                </tr>
              </thead>
              <tbody>
                {shown.map((t) => {
                  const g = evalGrade(code, t.avg, max);
                  return [
                    <tr key={t.key}>
                      <td><b>{t.name}</b></td>
                      <td>{t.count}</td>
                      {secs.map((s) => <td key={s.name} className="mono">{fmt(t.secAvg[s.name])}</td>)}
                      <td><span className={`avg-box ${gradeClass(g)}`}>{fmt(t.avg)}/{fmt(max)}<small>{fmt((t.avg / max) * 100, 1)}%</small></span></td>
                      <td><span className={`pill ${gradeClass(g)}`}>{g}</span></td>
                      <td>{dmyFull(t.last)}</td>
                      <td><button className="link-btn" onClick={() => setOpen(open === t.key ? null : t.key)}>{open === t.key ? 'Hide' : 'Show all'}</button></td>
                    </tr>,
                    open === t.key && (
                      <tr key={t.key + '-d'} className="detail-row">
                        <td colSpan={secs.length + 6}>
                          <table className="grid list-grid inner">
                            <thead><tr><th>Date</th><th>Class</th><th>Subject</th>{code === 'pedagogy' && <th>Topic</th>}<th>Given by</th><th>Score</th><th /></tr></thead>
                            <tbody>
                              {t.list.map((r) => (
                                <tr key={r.id}>
                                  <td>{dmyFull(r.eval_date)}</td><td>{r.class_id || '—'}</td><td>{r.subject || '—'}</td>{code === 'pedagogy' && <td>{r.topic || '—'}</td>}<td>{r.evaluator_name}</td>
                                  <td><b>{fmt(r.total)}/{fmt(r.max_total)}</b></td>
                                  <td className="row-actions"><button className="link-btn" onClick={() => setView(r)}>View / Print</button>{isAdmin && <button className="link-btn txt-err" onClick={() => setDel(r)}>Delete</button>}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    ),
                  ];
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {view && (
        <Modal wide title={`${form.name} — ${view.teacher_name}`} onClose={() => setView(null)}
          footer={<><button className="btn btn-ghost" onClick={() => setView(null)}>Close</button><button className="btn btn-primary" onClick={() => window.print()}>🖨 Print / PDF</button></>}>
          <div className="print-area"><EvalSheet ev={view} form={form} criteria={criteria} /></div>
        </Modal>
      )}
      {del && <Confirm danger busy={busy} title="Delete this evaluation?" confirmText="Delete" message={`${form.name} of ${del.teacher_name} on ${dmyFull(del.eval_date)} will be deleted permanently.`} onNo={() => setDel(null)} onYes={remove} />}
    </div>
  );
}
