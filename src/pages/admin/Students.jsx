import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { downloadCSV, errMsg, sortStudents } from '../../lib/util';
import { ClassSelect } from '../../components/Pickers';
import { Confirm, Empty, Field, Modal, Spinner, useToast } from '../../components/ui';

const blank = { admission_number: '', roll_number: '', name: '', class_id: '', father_name: '', mother_name: '', gender: '', dob: '', parent_contact: '', house: '', is_active: true };

export default function Students() {
  const { masters } = useAuth();
  const toast = useToast();
  const [classId, setClassId] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(false);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    if (!classId && q.trim().length < 2) { setRows([]); return; }
    setLoading(true);
    let qry = supabase.from('students').select('*');
    if (classId) qry = qry.eq('class_id', classId);
    else {
      const term = q.trim().replace(/[,()%*]/g, '');
      qry = qry.or(`name.ilike.%${term}%,admission_number.ilike.%${term}%`).limit(200);
    }
    const { data, error } = await qry;
    if (error) toast(errMsg(error), 'err');
    setRows(sortStudents(data || []));
    setLoading(false);
  }, [classId, q, toast]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  async function save() {
    const s = edit;
    if (!s.name.trim() || !s.admission_number.trim() || !s.class_id) return toast('Name, admission no. and class are required', 'err');
    setBusy(true);
    const payload = {
      admission_number: s.admission_number.trim(), name: s.name.trim(), class_id: s.class_id,
      roll_number: s.roll_number === '' || s.roll_number === null ? null : Number(s.roll_number),
      father_name: s.father_name || null, mother_name: s.mother_name || null, gender: s.gender || null,
      dob: s.dob || null, parent_contact: s.parent_contact || null, house: s.house || null, is_active: s.is_active,
    };
    const { error } = s.id ? await supabase.from('students').update(payload).eq('id', s.id) : await supabase.from('students').insert(payload);
    setBusy(false);
    if (error) return toast(error.code === '23505' ? 'This admission number already exists' : errMsg(error), 'err');
    toast('Student saved');
    setEdit(null);
    load();
  }

  async function autoRoll() {
    setBusy(true);
    const list = rows.filter((r) => r.is_active).sort((a, b) => a.name.localeCompare(b.name));
    try {
      for (let i = 0; i < list.length; i++) {
        const { error } = await supabase.from('students').update({ roll_number: i + 1 }).eq('id', list[i].id);
        if (error) throw error;
      }
      toast(`Roll numbers 1–${list.length} given in A–Z order`);
    } catch (e) { toast(errMsg(e), 'err'); }
    setBusy(false);
    setAsk(false);
    load();
  }

  const shown = rows.filter((r) => showInactive || r.is_active).filter((r) => !classId || !q || `${r.name} ${r.admission_number}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <div className="toolbar">
        <div className="toolbar-field"><ClassSelect classes={masters.classes} value={classId} onChange={setClassId} /></div>
        <input className="search" placeholder={classId ? 'Filter in class…' : 'Or search any student (name / adm no)…'} value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="check"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show inactive</label>
        <span className="toolbar-spacer" />
        {classId && rows.length > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setAsk(true)}>Auto roll no. (A–Z)</button>}
        {classId && rows.length > 0 && <button className="btn btn-ghost btn-sm" onClick={() => downloadCSV(`Students_${classId}.csv`, [['Roll', 'Adm No', 'Name', 'Father', 'Mother', 'Gender', 'DOB', 'Contact', 'House', 'Active'], ...rows.map((r) => [r.roll_number, r.admission_number, r.name, r.father_name, r.mother_name, r.gender, r.dob, r.parent_contact, r.house, r.is_active ? 'Yes' : 'No'])])}>⬇ CSV</button>}
        <button className="btn btn-primary btn-sm" onClick={() => setEdit({ ...blank, class_id: classId })}>+ Add student</button>
      </div>

      {loading ? <Spinner /> : !classId && q.trim().length < 2 ? <Empty icon="👆" title="Pick a class, or type a name to search" /> : !shown.length ? <Empty title="No students" /> : (
        <div className="grid-wrap">
          <table className="grid list-grid">
            <thead><tr><th>Roll</th><th>Adm No</th><th>Name</th>{!classId && <th>Class</th>}<th>Father</th><th>Mother</th><th>Contact</th><th>House</th><th /></tr></thead>
            <tbody>
              {shown.map((s) => (
                <tr key={s.id} className={s.is_active ? '' : 'row-off'}>
                  <td>{s.roll_number ?? '–'}</td><td>{s.admission_number}</td><td><b>{s.name}</b></td>
                  {!classId && <td>{s.class_id}</td>}
                  <td>{s.father_name}</td><td>{s.mother_name}</td><td>{s.parent_contact}</td><td>{s.house}</td>
                  <td><button className="link-btn" onClick={() => setEdit({ ...blank, ...Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v ?? ''])), is_active: s.is_active })}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {classId && <p className="muted small">{shown.length} student(s) in {classId}</p>}

      {edit && (
        <Modal wide title={edit.id ? `Edit — ${edit.name}` : 'Add student'} onClose={() => setEdit(null)}
          footer={<><button className="btn btn-ghost" onClick={() => setEdit(null)}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={save}>Save</button></>}>
          <div className="form-2">
            <Field label="Student name"><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Admission / Reg No"><input value={edit.admission_number} onChange={(e) => setEdit({ ...edit, admission_number: e.target.value })} /></Field>
            <Field label="Class"><ClassSelect classes={masters.classes} value={edit.class_id} onChange={(v) => setEdit({ ...edit, class_id: v })} /></Field>
            <Field label="Roll number"><input inputMode="numeric" value={edit.roll_number} onChange={(e) => setEdit({ ...edit, roll_number: e.target.value.replace(/\D/g, '') })} /></Field>
            <Field label="Father's name"><input value={edit.father_name} onChange={(e) => setEdit({ ...edit, father_name: e.target.value })} /></Field>
            <Field label="Mother's name"><input value={edit.mother_name} onChange={(e) => setEdit({ ...edit, mother_name: e.target.value })} /></Field>
            <Field label="Parent mobile"><input value={edit.parent_contact} onChange={(e) => setEdit({ ...edit, parent_contact: e.target.value })} /></Field>
            <Field label="House"><input value={edit.house} onChange={(e) => setEdit({ ...edit, house: e.target.value })} placeholder="e.g. Rajguru House" /></Field>
            <Field label="Gender"><select value={edit.gender} onChange={(e) => setEdit({ ...edit, gender: e.target.value })}><option value="">—</option><option value="M">Male</option><option value="F">Female</option></select></Field>
            <Field label="Date of birth"><input type="date" value={edit.dob} onChange={(e) => setEdit({ ...edit, dob: e.target.value })} /></Field>
            <Field label="Status"><select value={edit.is_active ? '1' : '0'} onChange={(e) => setEdit({ ...edit, is_active: e.target.value === '1' })}><option value="1">Active</option><option value="0">Inactive (left school)</option></select></Field>
          </div>
        </Modal>
      )}
      {ask && <Confirm busy={busy} title="Give roll numbers A–Z?" message={`All active students of ${classId} will get roll numbers 1, 2, 3… in alphabetical order. Existing roll numbers will be replaced.`} onNo={() => setAsk(false)} onYes={autoRoll} />}
    </div>
  );
}
