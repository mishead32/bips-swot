import { memo, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { FEE_OPTIONS, PTM_OPTIONS, SPORTS_LEVELS, band, talentLevel } from '../../lib/config';
import { avg, errMsg, fmt } from '../../lib/util';
import { useToast } from '../../components/ui';
import { cellKey, display, isEmpty, rawToRow, rowToRaw, sameRaw, validate } from './cells';

function Cell({ type, value, onChange, err, nav, onKey }) {
  const cls = `cell ${err ? 'cell-bad' : ''}`;
  if (type === 'sports' || type === 'fee' || type === 'ptm') {
    const opts = type === 'sports' ? SPORTS_LEVELS : type === 'fee' ? FEE_OPTIONS : PTM_OPTIONS;
    return (
      <select data-nav={nav} className={`cell-select ${value ? 'has' : ''}`} value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={onKey}>
        <option value="">–</option>
        {opts.map((o) => <option key={o}>{o}</option>)}
      </select>
    );
  }
  if (type === 'video') {
    return (
      <div className="video-cell">
        <input className={`cell-txt ${err ? 'cell-bad' : ''}`} placeholder="Caption e.g. Reading" value={value.cap} onChange={(e) => onChange({ ...value, cap: e.target.value })} />
        <input data-nav={nav} className={`cell-txt ${err ? 'cell-bad' : ''}`} placeholder="https://youtu.be/…" value={value.link} onChange={(e) => onChange({ ...value, link: e.target.value.trim() })} onKeyDown={onKey} />
      </div>
    );
  }
  const shade = type === 'score10' && value !== 'NA' && !err ? band(value) : type === 'level10' && value && !err ? 'band-high' : '';
  return (
    <input
      data-nav={nav}
      className={`${cls} ${value.toUpperCase?.() === 'NA' ? 'cell-na' : shade}`}
      value={value}
      inputMode="decimal"
      maxLength={5}
      title={type === 'level10' ? talentLevel(value) : err}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v.toUpperCase() === 'NA' ? 'NA' : v.replace(type === 'score10' ? /[^0-9.naNA]/g : /[^0-9.]/g, ''));
      }}
      onKeyDown={onKey}
      onFocus={(e) => e.target.select()}
    />
  );
}

function Locked({ type, row }) {
  const t = display(type, row);
  if (type === 'video') return <a className="locked-chip video-chip" href={row.value_text} target="_blank" rel="noreferrer" title={row.value_text}>▶ {t}</a>;
  const shade = type === 'score10' ? band(row.value_num) : type === 'level10' ? 'band-high' : type === 'fee' ? (t === 'Paid' ? 'band-high' : t === 'Pending' ? 'band-low' : '') : type === 'ptm' ? (t === 'P' ? 'band-high' : t === 'A' ? 'band-low' : '') : '';
  return <span className={`locked-chip ${shade}`} title={`Saved by ${row.entered_name || 'teacher'} · ${new Date(row.entered_at).toLocaleDateString('en-IN')}${type === 'level10' ? ' · ' + talentLevel(row.value_num) : ''}`}>{t}</span>;
}

function HeadingCard({ number, heading, items, students, saved, isAdmin, ctx, onReload, registerSaver, onDirty }) {
  const toast = useToast();
  const [draft, setDraft] = useState({});
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [fillVal, setFillVal] = useState('');
  const isAttendance = items.some((i) => i.input_type === 'attendance');
  const savedWd = useMemo(() => Object.values(saved).find((r) => r.value_num2 != null)?.value_num2, [saved]);
  const [wd, setWd] = useState('');

  // reset the boxes whenever saved data / class / month changes
  useEffect(() => {
    const d = {};
    students.forEach((s) => items.forEach((it) => { d[cellKey(s.id, it.id)] = rowToRaw(it.input_type, saved[cellKey(s.id, it.id)]); }));
    setDraft(d);
    setWd(savedWd != null ? String(Number(savedWd)) : '');
  }, [saved, students, items, savedWd]);

  const editable = (k) => isAdmin || !saved[k];

  const { changes, errors } = useMemo(() => {
    const ch = [];
    const er = {};
    students.forEach((s) => items.forEach((it) => {
      const k = cellKey(s.id, it.id);
      if (!editable(k) || draft[k] === undefined) return;
      const before = rowToRaw(it.input_type, saved[k]);
      if (sameRaw(it.input_type, draft[k], before)) return;
      const e = validate(it.input_type, draft[k], wd);
      if (e) er[k] = e;
      ch.push({ k, s, it });
    }));
    return { changes: ch, errors: er };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, saved, wd, students, items, isAdmin]);

  useEffect(() => { onDirty(heading.code, changes.length); }, [changes.length, heading.code, onDirty]);

  async function save() {
    if (!changes.length) return true;
    const nErr = Object.keys(errors).length;
    if (nErr) { toast(`${heading.name}: ${nErr} box(es) are wrong (shown in red).`, 'err'); setOpen(true); return false; }
    setBusy(true);
    try {
      const upserts = [];
      const deletes = [];
      changes.forEach(({ k, s, it }) => {
        const raw = draft[k];
        if (isEmpty(it.input_type, raw)) { if (saved[k]) deletes.push(saved[k].id); return; }
        upserts.push({ session: ctx.session, month: ctx.month, student_id: s.id, item_id: it.id, entry_date: ctx.date, ...{ value_num: null, value_num2: null, value_text: null, value_text2: null }, ...rawToRow(it.input_type, raw, wd) });
      });
      for (let i = 0; i < upserts.length; i += 500) {
        const chunk = upserts.slice(i, i + 500);
        const q = isAdmin
          ? supabase.from('swot_values').upsert(chunk, { onConflict: 'session,month,student_id,item_id' })
          : supabase.from('swot_values').insert(chunk);
        const { error } = await q;
        if (error) throw error;
      }
      if (deletes.length) {
        const { error } = await supabase.from('swot_values').delete().in('id', deletes);
        if (error) throw error;
      }
      toast(`${heading.name}: ${upserts.length} saved${deletes.length ? `, ${deletes.length} deleted` : ''} ✔`);
      return true;
    } catch (e) {
      toast(e.code === '23505' ? `${heading.name}: some boxes were already filled by someone else. Page refreshed.` : `${heading.name}: ${errMsg(e)}`, 'err');
      return false;
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { registerSaver(heading.code, save); });

  async function copyLastMonth() {
    const { data, error } = await supabase.from('swot_values').select('student_id,item_id,value_num,value_num2,value_text,value_text2')
      .eq('session', ctx.prevSession).eq('month', ctx.prevMonth).eq('class_id', ctx.classId).in('item_id', items.map((i) => i.id));
    if (error) return toast(errMsg(error), 'err');
    if (!data.length) return toast(`${heading.name}: nothing saved last month.`, 'err');
    setDraft((d) => {
      const n = { ...d };
      data.forEach((r) => {
        const it = items.find((i) => i.id === r.item_id);
        const k = cellKey(r.student_id, r.item_id);
        if (it && editable(k) && isEmpty(it.input_type, n[k]) && it.input_type !== 'video') n[k] = rowToRaw(it.input_type, r);
      });
      return n;
    });
    toast(`${heading.name}: last month copied into empty boxes. Check, then save.`);
  }

  function fillEmpty() {
    if (validate('score10', fillVal) || !fillVal) return toast('Enter 0–10 or NA', 'err');
    setDraft((d) => {
      const n = { ...d };
      students.forEach((s) => items.forEach((it) => {
        const k = cellKey(s.id, it.id);
        if (it.input_type === 'score10' && editable(k) && !n[k]) n[k] = fillVal.toUpperCase() === 'NA' ? 'NA' : fillVal;
      }));
      return n;
    });
  }

  const onKey = (e, r, c) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const rr = e.key === 'ArrowUp' ? r - 1 : r + 1;
      const el = document.querySelector(`[data-nav="${heading.code}-${rr}-${c}"]`);
      if (el) { e.preventDefault(); el.focus(); el.select?.(); }
    }
  };

  const total = students.length * items.length;
  const filled = Object.keys(saved).length;
  const scoreItems = items.filter((i) => i.input_type === 'score10');
  const hasScore = scoreItems.length > 0;
  const groups = items.some((i) => i.group_name);
  const val = (s, it) => {
    const k = cellKey(s.id, it.id);
    return editable(k) ? draft[k] : rowToRaw(it.input_type, saved[k]);
  };
  const rowAvg = (s) => avg(scoreItems.map((it) => val(s, it)).filter((v) => v && v !== 'NA' && !validate('score10', v)));
  const colAvg = (it) => avg(students.map((s) => val(s, it)).filter((v) => v && v !== 'NA' && !validate('score10', v)));
  const isTalent = items.some((i) => ['level10', 'sports'].includes(i.input_type));

  return (
    <section className="hcard" id={`h-${heading.code}`}>
      <header className="hcard-head" onClick={() => setOpen(!open)}>
        <span className="hnum">{number}</span>
        <div className="hcard-title">
          <h3>{heading.name}</h3>
          {heading.scale_note && <div className="hnote">{heading.scale_note}</div>}
        </div>
        <span className={`hcount ${!isTalent && filled === total && total ? 'done' : ''}`}>{isTalent ? `${filled} entries` : `${filled}/${total}`}</span>
        <span className="chev">{open ? '▾' : '▸'}</span>
      </header>
      {open && (
        <div className="hcard-body">
          <div className="toolbar">
            {isAttendance && (
              <label className="wd">Working days this month
                <input inputMode="numeric" value={wd} disabled={!isAdmin && savedWd != null} onChange={(e) => setWd(e.target.value.replace(/\D/g, '').slice(0, 2))} />
              </label>
            )}
            <button className="btn btn-ghost btn-sm" onClick={copyLastMonth}>⤵ Copy last month into empty boxes</button>
            {hasScore && (
              <div className="fill">
                <input className="fill-input" placeholder="e.g. 7" value={fillVal} onChange={(e) => setFillVal(e.target.value)} />
                <button className="btn btn-ghost btn-sm" onClick={fillEmpty}>Fill empty boxes</button>
              </div>
            )}
            <span className="toolbar-spacer" />
            {changes.length > 0 && <span className="dirty-note">{changes.length} unsaved</span>}
            <button className="btn btn-primary btn-sm" disabled={busy || !changes.length} onClick={async () => { if (await save()) onReload(); }}>{busy ? 'Saving…' : isAdmin ? 'Save' : 'Save & lock 🔒'}</button>
          </div>
          <div className="grid-wrap">
            <table className="grid">
              <thead>
                {groups && (
                  <tr>
                    <th className="sticky-col c-roll" /><th className="sticky-col c-name" />
                    {items.map((it, i) => (i === 0 || items[i - 1].group_name !== it.group_name) && (
                      <th key={it.id} className="grp" colSpan={items.slice(i).findIndex((x) => x.group_name !== it.group_name) === -1 ? items.length - i : items.slice(i).findIndex((x) => x.group_name !== it.group_name)}>{it.group_name || ''}</th>
                    ))}
                    {hasScore && <th />}
                  </tr>
                )}
                <tr>
                  <th className="sticky-col c-roll">Roll</th>
                  <th className="sticky-col c-name">Student</th>
                  {items.map((it, i) => (
                    <th key={it.id} className={`c-param ${it.input_type === 'video' ? 'c-video' : ''}`}>
                      {items.length > 1 && <span className="param-letter">{String.fromCharCode(97 + i)}</span>}{it.name}
                    </th>
                  ))}
                  {hasScore && scoreItems.length > 1 && <th className="c-avg">Avg</th>}
                </tr>
              </thead>
              <tbody>
                {students.map((s, r) => {
                  const ra = hasScore && scoreItems.length > 1 ? rowAvg(s) : null;
                  return (
                    <tr key={s.id}>
                      <td className="sticky-col c-roll">{s.roll_number ?? '–'}</td>
                      <td className="sticky-col c-name"><div className="stu-name">{s.name}</div><div className="stu-sub">Adm {s.admission_number}</div></td>
                      {items.map((it, c) => {
                        const k = cellKey(s.id, it.id);
                        return (
                          <td key={it.id} className={`c-param ${it.input_type === 'video' ? 'c-video' : ''}`}>
                            {editable(k) ? (
                              <Cell type={it.input_type} value={draft[k] ?? rowToRaw(it.input_type)} err={errors[k]}
                                nav={`${heading.code}-${r}-${c}`} onKey={(e) => onKey(e, r, c)}
                                onChange={(v) => setDraft((d) => ({ ...d, [k]: v }))} />
                            ) : <Locked type={it.input_type} row={saved[k]} />}
                            {isAdmin && saved[k] && <span className="admin-dot" title={`Saved by ${saved[k].entered_name || ''}`} />}
                          </td>
                        );
                      })}
                      {hasScore && scoreItems.length > 1 && <td className={`c-avg ${band(ra)}`}>{fmt(ra)}</td>}
                    </tr>
                  );
                })}
              </tbody>
              {hasScore && (
                <tfoot>
                  <tr>
                    <td className="sticky-col c-roll" /><td className="sticky-col c-name"><b>Class average</b></td>
                    {items.map((it) => { const a = it.input_type === 'score10' ? colAvg(it) : null; return <td key={it.id} className={`c-param foot-avg ${band(a)}`}>{it.input_type === 'score10' ? fmt(a) : ''}</td>; })}
                    {scoreItems.length > 1 && <td className="c-avg" />}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {!isAdmin && <p className="muted small">🔒 Saved boxes are locked. Only the Admin can change or delete them.</p>}
        </div>
      )}
    </section>
  );
}

export default memo(HeadingCard);
