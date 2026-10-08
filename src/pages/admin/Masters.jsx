import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { errMsg } from '../../lib/util';
import { Field, useToast } from '../../components/ui';

export default function Masters() {
  const [tab, setTab] = useState('params');
  return (
    <div>
      <div className="subtabs">
        {[['params', 'SWOT headings & sub-types'], ['subjects', 'Subjects (Academic Record)'], ['classes', 'Classes']].map(([k, l]) => (
          <button key={k} className={`subtab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === 'params' && <Params />}
      {tab === 'subjects' && <Subjects />}
      {tab === 'classes' && <Classes />}
    </div>
  );
}

function useSaver() {
  const { reloadMasters } = useAuth();
  const toast = useToast();
  return async (promise, okMsg = 'Saved') => {
    const { error } = await promise;
    if (error) { toast(errMsg(error), 'err'); return false; }
    toast(okMsg);
    await reloadMasters();
    return true;
  };
}

const TYPES = { score10: 'Marks 0–10 / NA', level10: 'Talent level 1–10', sports: 'Sports level', video: 'Video link', attendance: 'Attendance', fee: 'Paid / Pending', ptm: 'P / A' };

function Params() {
  const { masters } = useAuth();
  const run = useSaver();
  const list = masters.headings;
  const [code, setCode] = useState(list[0]?.code || '');
  const [name, setName] = useState('');
  const [type, setType] = useState('score10');
  const sec = list.find((s) => s.code === code);
  const [note, setNote] = useState(sec?.scale_note || '');
  const items = masters.items.filter((p) => p.heading_code === code);

  return (
    <div className="master-2">
      <div className="card">
        <h4>22 Headings</h4>
        <div className="sec-list">
          {list.map((s, i) => (
            <button key={s.code} className={`sec-item ${s.code === code ? 'on' : ''} ${s.is_active ? '' : 'off'}`} onClick={() => { setCode(s.code); setNote(s.scale_note || ''); }}>
              <span>{i + 1}. {s.name}</span><span className="muted">{s.code === 'academic' ? '—' : masters.items.filter((p) => p.heading_code === s.code && p.is_active).length}</span>
            </button>
          ))}
        </div>
      </div>
      {sec && (
        <div className="card">
          <h4>{sec.name}</h4>
          <Field label="Guide text shown to teachers">
            <div className="row-gap"><input value={note} onChange={(e) => setNote(e.target.value)} />
              <button className="btn btn-ghost btn-sm" onClick={() => run(supabase.from('swot_headings').update({ scale_note: note }).eq('code', code))}>Save</button></div>
          </Field>
          <label className="check"><input type="checkbox" checked={sec.is_active} onChange={(e) => run(supabase.from('swot_headings').update({ is_active: e.target.checked }).eq('code', code))} /> Heading in use</label>
          {code === 'academic' ? <p className="muted">Academic Record uses Subjects (next tab) and tests added by date.</p> : (
            <>
              <table className="grid list-grid mt">
                <thead><tr><th>#</th><th>Sub-type</th><th>Type</th><th>Order</th><th>In use</th></tr></thead>
                <tbody>
                  {items.map((p, i) => (
                    <tr key={p.id} className={p.is_active ? '' : 'row-off'}>
                      <td>{String.fromCharCode(97 + i)}</td>
                      <td><input className="inline-input" defaultValue={p.name} onBlur={(e) => e.target.value.trim() && e.target.value !== p.name && run(supabase.from('swot_items').update({ name: e.target.value.trim() }).eq('id', p.id), 'Renamed')} /></td>
                      <td className="muted small">{TYPES[p.input_type]}</td>
                      <td><input className="inline-input num" defaultValue={p.sort_order} onBlur={(e) => Number(e.target.value) !== p.sort_order && run(supabase.from('swot_items').update({ sort_order: Number(e.target.value) || 0 }).eq('id', p.id))} /></td>
                      <td><input type="checkbox" checked={p.is_active} onChange={(e) => run(supabase.from('swot_items').update({ is_active: e.target.checked }).eq('id', p.id))} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="row-gap mt">
                <input placeholder="New sub-type name" value={name} onChange={(e) => setName(e.target.value)} />
                <select style={{ width: 180 }} value={type} onChange={(e) => setType(e.target.value)}>{Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                <button className="btn btn-primary btn-sm" disabled={!name.trim()} onClick={async () => {
                  if (await run(supabase.from('swot_items').insert({ heading_code: code, name: name.trim(), input_type: type, sort_order: items.length + 1 }), 'Sub-type added')) setName('');
                }}>+ Add</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Subjects() {
  const { masters } = useAuth();
  const run = useSaver();
  const [name, setName] = useState('');
  return (
    <div className="card">
      <h4>Subjects</h4>
      <table className="grid list-grid">
        <thead><tr><th>Subject</th><th>Grades (A/B…) instead of marks</th><th>In use</th></tr></thead>
        <tbody>
          {masters.subjects.map((s) => (
            <tr key={s.id} className={s.is_active ? '' : 'row-off'}>
              <td><input className="inline-input" defaultValue={s.name} onBlur={(e) => e.target.value.trim() && e.target.value !== s.name && run(supabase.from('subjects').update({ name: e.target.value.trim() }).eq('id', s.id), 'Renamed')} /></td>
              <td><input type="checkbox" checked={s.grade_based} onChange={(e) => run(supabase.from('subjects').update({ grade_based: e.target.checked }).eq('id', s.id))} /></td>
              <td><input type="checkbox" checked={s.is_active} onChange={(e) => run(supabase.from('subjects').update({ is_active: e.target.checked }).eq('id', s.id))} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row-gap mt">
        <input placeholder="New subject" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn btn-primary btn-sm" disabled={!name.trim()} onClick={async () => { if (await run(supabase.from('subjects').insert({ name: name.trim(), sort_order: masters.subjects.length + 1 }), 'Subject added')) setName(''); }}>+ Add</button>
      </div>
    </div>
  );
}

function Classes() {
  const { masters } = useAuth();
  const run = useSaver();
  const [f, setF] = useState({ grade: '', section: '', wing: 'Primary' });
  return (
    <div className="card">
      <h4>Classes ({masters.classes.length})</h4>
      <table className="grid list-grid">
        <thead><tr><th>Class ID</th><th>Wing</th><th>Order</th><th>In use</th></tr></thead>
        <tbody>
          {masters.classes.map((c) => (
            <tr key={c.id} className={c.is_active ? '' : 'row-off'}>
              <td><b>{c.id}</b></td><td>{c.wing}</td>
              <td><input className="inline-input num" defaultValue={c.sort_order} onBlur={(e) => Number(e.target.value) !== c.sort_order && run(supabase.from('classes').update({ sort_order: Number(e.target.value) || 0 }).eq('id', c.id))} /></td>
              <td><input type="checkbox" checked={c.is_active} onChange={(e) => run(supabase.from('classes').update({ is_active: e.target.checked }).eq('id', c.id))} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row-gap mt">
        <input placeholder="Grade e.g. V" value={f.grade} onChange={(e) => setF({ ...f, grade: e.target.value })} />
        <input placeholder="Section e.g. Jupiter" value={f.section} onChange={(e) => setF({ ...f, section: e.target.value })} />
        <select value={f.wing} onChange={(e) => setF({ ...f, wing: e.target.value })}>{['Montessori', 'Primary', 'Middle', 'Senior'].map((w) => <option key={w}>{w}</option>)}</select>
        <button className="btn btn-primary btn-sm" disabled={!f.grade.trim() || !f.section.trim()} onClick={async () => {
          const id = `${f.grade.trim()}-${f.section.trim()}`;
          if (await run(supabase.from('classes').insert({ id, grade: f.grade.trim(), section: f.section.trim(), wing: f.wing, sort_order: masters.classes.length + 1 }), `Class ${id} added`)) setF({ ...f, section: '' });
        }}>+ Add class</button>
      </div>
    </div>
  );
}
