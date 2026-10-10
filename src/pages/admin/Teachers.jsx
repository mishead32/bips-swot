import { useCallback, useEffect, useState } from 'react';
import Papa from 'papaparse';
import { adminApi, supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { errMsg } from '../../lib/util';
import ClassPicker from '../../components/ClassPicker';
import { Confirm, Empty, Field, Modal, Spinner, useToast } from '../../components/ui';

const blank = { name: '', email: '', password: '', role: 'teacher', assigned_classes: [], phone: '', is_active: true };

export default function Teachers() {
  const { masters, profile } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState(null); // object; has id when editing
  const [busy, setBusy] = useState(false);
  const [pwFor, setPwFor] = useState(null);
  const [newPw, setNewPw] = useState('');
  const [del, setDel] = useState(null);
  const [bulk, setBulk] = useState(null);

  const classes = masters.classes.filter((c) => c.is_active);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('teachers').select('*').order('name');
    if (error) toast(errMsg(error), 'err');
    setRows(data || []);
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  async function save() {
    const t = edit;
    if (!t.name.trim() || !t.email.trim()) return toast('Name and email are required', 'err');
    setBusy(true);
    try {
      if (t.id) {
        const { error } = await supabase.from('teachers').update({
          name: t.name.trim(), role: t.role, assigned_classes: t.assigned_classes, phone: t.phone || null, is_active: t.is_active,
        }).eq('id', t.id);
        if (error) throw error;
        toast('Teacher updated');
      } else {
        if (t.password.length < 6) throw new Error('Temporary password must be at least 6 characters');
        await adminApi('create', t);
        toast(`Teacher created. Share login: ${t.email.trim().toLowerCase()} / ${t.password}`);
      }
      setEdit(null);
      load();
    } catch (e) { toast(errMsg(e), 'err'); }
    setBusy(false);
  }

  async function resetPw() {
    setBusy(true);
    try { await adminApi('reset_password', { id: pwFor.id, password: newPw }); toast(`Password reset for ${pwFor.name}`); setPwFor(null); setNewPw(''); }
    catch (e) { toast(errMsg(e), 'err'); }
    setBusy(false);
  }

  async function remove() {
    setBusy(true);
    try { await adminApi('delete', { id: del.id }); toast('Teacher deleted'); setDel(null); load(); }
    catch (e) { toast(errMsg(e), 'err'); }
    setBusy(false);
  }

  function readBulk(file) {
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, '_'),
      complete: ({ data }) => {
        const ids = new Set(classes.map((c) => c.id));
        const list = data.map((r) => {
          const cls = String(r.assigned_classes || r.classes || '').split(/[;|]/).map((x) => x.trim()).filter(Boolean);
          const bad = cls.filter((c) => !ids.has(c));
          return {
            name: (r.name || '').trim(), email: (r.email || '').trim().toLowerCase(),
            password: (r.password || r.temporary_password || '').trim(),
            role: /^(hod|head)/i.test((r.role || '').trim()) ? 'hod' : 'teacher',
            assigned_classes: cls.filter((c) => ids.has(c)), phone: (r.phone || '').trim(),
            problem: !r.name || !r.email ? 'Name/email missing' : (r.password || r.temporary_password || '').trim().length < 6 ? 'Password < 6 chars' : bad.length ? `Unknown class: ${bad.join(', ')}` : '',
            result: '',
          };
        });
        setBulk(list);
      },
    });
  }

  async function runBulk() {
    setBusy(true);
    const list = [...bulk];
    for (let i = 0; i < list.length; i++) {
      if (list[i].problem && !list[i].problem.startsWith('Unknown class')) { list[i] = { ...list[i], result: 'Skipped' }; continue; }
      try { await adminApi('create', list[i]); list[i] = { ...list[i], result: '✔ Created' }; }
      catch (e) { list[i] = { ...list[i], result: `✖ ${errMsg(e)}` }; }
      setBulk([...list]);
    }
    setBusy(false);
    load();
  }

  if (!rows) return <Spinner />;
  const shown = rows.filter((r) => `${r.name} ${r.email} ${r.assigned_classes.join(' ')}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <div className="toolbar">
        <input className="search" placeholder="Search name, email or class…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="toolbar-spacer" />
        <label className="btn btn-ghost btn-sm file-btn">⬆ Upload teachers CSV<input type="file" accept=".csv" onChange={(e) => e.target.files[0] && readBulk(e.target.files[0])} /></label>
        <button className="btn btn-primary btn-sm" onClick={() => setEdit({ ...blank })}>+ Add New Teacher</button>
      </div>

      {!shown.length ? <Empty title="No teachers found" /> : (
        <div className="grid-wrap">
          <table className="grid list-grid">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Assigned classes</th><th>Status</th><th /></tr></thead>
            <tbody>
              {shown.map((t) => (
                <tr key={t.id}>
                  <td><b>{t.name}</b>{t.phone && <div className="stu-sub">{t.phone}</div>}</td>
                  <td>{t.email}</td>
                  <td><span className={`pill ${t.role === 'admin' ? 'pill-locked' : t.role === 'hod' ? 'pill-draft' : 'pill-new'}`}>{t.role === 'admin' ? 'Admin' : t.role === 'hod' ? 'Head of Department' : 'Teacher'}</span></td>
                  <td className="cls-cell">{t.role === 'admin' ? <span className="muted">All classes</span> : t.assigned_classes.length ? t.assigned_classes.join(', ') : <span className="txt-err">None</span>}</td>
                  <td>{t.is_active ? 'Active' : <span className="txt-err">Inactive</span>}</td>
                  <td className="row-actions">
                    <button className="link-btn" onClick={() => setEdit({ ...blank, ...t, phone: t.phone || '' })}>Edit</button>
                    <button className="link-btn" onClick={() => setPwFor(t)}>Reset password</button>
                    {t.id !== profile.id && <button className="link-btn txt-err" onClick={() => setDel(t)}>Delete</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small">{rows.length} staff login(s). Teachers CSV columns: <code>name, email, password, role, assigned_classes</code> (role = <code>teacher</code> or <code>hod</code>) — separate many classes with <code>;</code> e.g. <code>I-Sunflower;II-Arctic</code></p>

      {edit && (
        <Modal wide title={edit.id ? `Edit ${edit.name}` : 'Add New Teacher'} onClose={() => setEdit(null)}
          footer={<><button className="btn btn-ghost" onClick={() => setEdit(null)}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : edit.id ? 'Save changes' : 'Create Teacher'}</button></>}>
          <div className="form-2">
            <Field label="Full name"><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Ms. Swati Syal" /></Field>
            <Field label="Email (login ID)"><input type="email" disabled={Boolean(edit.id)} value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field>
            {!edit.id && <Field label="Temporary password" hint="Min 6 characters. Teacher can change it after login."><input value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} placeholder="e.g. Bips@1234" /></Field>}
            <Field label="Phone (optional)"><input value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
            {edit.role === 'admin' ? (
              <Field label="User type"><input value="Admin — master control (only one)" disabled /></Field>
            ) : (
              <Field label="User type">
                <select value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })}>
                  <option value="teacher">Teacher — fills SWOT for assigned classes</option>
                  <option value="hod">Head of Department — SWOT + Pedagogy &amp; Notebook Inspection</option>
                </select>
              </Field>
            )}
            {edit.id && <Field label="Status"><select value={edit.is_active ? '1' : '0'} onChange={(e) => setEdit({ ...edit, is_active: e.target.value === '1' })}><option value="1">Active</option><option value="0">Inactive (cannot log in to data)</option></select></Field>}
          </div>
          {edit.role !== 'admin' && (
            <Field label={`Assigned classes (${edit.assigned_classes.length} selected)`}>
              <ClassPicker classes={classes} value={edit.assigned_classes} onChange={(v) => setEdit({ ...edit, assigned_classes: v })} />
            </Field>
          )}
        </Modal>
      )}

      {pwFor && (
        <Modal title={`Reset password — ${pwFor.name}`} onClose={() => setPwFor(null)}
          footer={<><button className="btn btn-ghost" onClick={() => setPwFor(null)}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={resetPw}>Set password</button></>}>
          <Field label="New temporary password" hint="Share it with the teacher."><input value={newPw} onChange={(e) => setNewPw(e.target.value)} /></Field>
        </Modal>
      )}

      {del && <Confirm danger busy={busy} title="Delete this teacher?" confirmText="Delete" message={`${del.name} (${del.email}) will no longer be able to log in. Data they entered stays.`} onNo={() => setDel(null)} onYes={remove} />}

      {bulk && (
        <Modal wide title={`Upload teachers — ${bulk.length} row(s)`} onClose={() => !busy && setBulk(null)}
          footer={<><button className="btn btn-ghost" disabled={busy} onClick={() => setBulk(null)}>Close</button><button className="btn btn-primary" disabled={busy} onClick={runBulk}>{busy ? 'Creating…' : 'Create all'}</button></>}>
          <div className="grid-wrap short">
            <table className="grid list-grid">
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Classes</th><th>Check</th><th>Result</th></tr></thead>
              <tbody>{bulk.map((b, i) => (
                <tr key={i}><td>{b.name}</td><td>{b.email}</td><td>{b.role}</td><td>{b.assigned_classes.join(', ')}</td>
                  <td className={b.problem ? 'txt-err' : ''}>{b.problem || 'OK'}</td><td>{b.result}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </Modal>
      )}
    </div>
  );
}
