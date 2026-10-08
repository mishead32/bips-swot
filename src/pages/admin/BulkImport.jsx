import { useState } from 'react';
import Papa from 'papaparse';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { downloadCSV, errMsg, parseDMY } from '../../lib/util';
import { Empty, useToast } from '../../components/ui';

const MONT_ORDER = { 'M I': 1, 'M II': 2, 'M III': 3, 'M IV': 4, I: 5, II: 6, III: 7, IV: 8, V: 9, VI: 10, VII: 11, VIII: 12, IX: 13, X: 14, XI: 15, XII: 16 };
const wingOf = (o) => (o <= 4 ? 'Montessori' : o <= 9 ? 'Primary' : o <= 12 ? 'Middle' : 'Senior');

/** Accepts the school ERP "studentReport.csv" OR the simple template */
function mapRow(r) {
  const g = (...names) => {
    for (const n of names) {
      const k = Object.keys(r).find((x) => x.replace(/[^a-z]/gi, '').toLowerCase() === n.replace(/[^a-z]/gi, '').toLowerCase());
      if (k && r[k] !== undefined && String(r[k]).trim() !== '') return String(r[k]).trim();
    }
    return '';
  };
  const roll = g('roll_number', 'Roll No', 'Roll');
  return {
    admission_number: g('admission_number', 'Reg No', 'Admission No', 'Adm No').replace(/'/g, ''),
    name: g('name', 'Student Name').replace(/\s+/g, ' '),
    class_id: g('class_id', 'Class Name', 'Class').replace(/\s+/g, ' '),
    roll_number: roll ? Number(roll) : null,
    father_name: g('father_name', "Father's Name", 'parent_name', 'Father Name') || null,
    mother_name: g('mother_name', "Mother's Name", 'Mother Name') || null,
    gender: g('gender', 'Gender') || null,
    dob: parseDMY(g('dob', 'D.O.B', 'Date of Birth')),
    admission_date: parseDMY(g('admission_date', 'Date Of Admission')),
    parent_contact: g('parent_contact', 'Mobile', 'Mobile No', 'Contact') || null,
    house: g('house', 'House') || null,
  };
}

export default function BulkImport() {
  const { masters, reloadMasters } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState('');
  const [createClasses, setCreateClasses] = useState(true);
  const [autoRoll, setAutoRoll] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  const known = new Set(masters.classes.map((c) => c.id));

  function onFile(f) {
    setFileName(f.name);
    setDone(null);
    Papa.parse(f, {
      header: true,
      skipEmptyLines: true,
      complete: ({ data }) => {
        const seen = new Set();
        const list = data.map(mapRow).map((r) => {
          let problem = '';
          if (!r.name) problem = 'Name missing';
          else if (!r.admission_number) problem = 'Admission no. missing';
          else if (!r.class_id) problem = 'Class missing';
          else if (seen.has(r.admission_number)) problem = 'Duplicate admission no. in file';
          seen.add(r.admission_number);
          return { ...r, problem };
        });
        setRows(list);
      },
      error: (e) => toast(errMsg(e), 'err'),
    });
  }

  const newClasses = rows ? [...new Set(rows.filter((r) => r.class_id && !known.has(r.class_id)).map((r) => r.class_id))] : [];
  const good = rows ? rows.filter((r) => !r.problem && (known.has(r.class_id) || createClasses)) : [];

  async function runImport() {
    setBusy(true);
    try {
      if (createClasses && newClasses.length) {
        const add = newClasses.map((id) => {
          const isM = id.startsWith('M ');
          const [grade, ...rest] = id.split('-');
          const o = MONT_ORDER[grade.trim()] || 50;
          return { id, grade: grade.trim(), section: rest.join('-') || id, wing: isM ? 'Montessori' : wingOf(o), sort_order: o * 10 + 5 };
        });
        const { error } = await supabase.from('classes').upsert(add, { onConflict: 'id', ignoreDuplicates: true });
        if (error) throw error;
      }
      let list = good.map(({ problem, ...r }) => r);
      if (autoRoll) {
        const byClass = {};
        list.forEach((r) => { (byClass[r.class_id] ||= []).push(r); });
        Object.values(byClass).forEach((arr) => {
          if (arr.every((r) => r.roll_number === null)) {
            arr.sort((a, b) => a.name.localeCompare(b.name)).forEach((r, i) => { r.roll_number = i + 1; });
          }
        });
      }
      // Leave out columns the file does not have, so existing data (e.g. mobile, house) is not wiped
      const cols = Object.keys(list[0] || {}).filter((c) => list.some((r) => r[c] !== null && r[c] !== ''));
      list = list.map((r) => Object.fromEntries(cols.map((c) => [c, r[c] === '' ? null : r[c]])));
      for (let i = 0; i < list.length; i += 500) {
        const { error } = await supabase.from('students').upsert(list.slice(i, i + 500), { onConflict: 'admission_number' });
        if (error) throw error;
      }
      if (newClasses.length) await reloadMasters();
      setDone(list.length);
      toast(`${list.length} students imported successfully`);
    } catch (e) {
      toast(errMsg(e), 'err');
    }
    setBusy(false);
  }

  const template = () => downloadCSV('students_template.csv', [
    ['name', 'admission_number', 'roll_number', 'class_id', 'father_name', 'mother_name', 'parent_contact', 'house'],
    ['Aadvik', '5258', '1', 'I-Sunflower', 'Mr. Neeraj Kumar', '', '8894229303', 'Rajguru House'],
  ]);

  return (
    <div className="import">
      <div className="card import-drop">
        <div className="import-icon">⬆</div>
        <div>
          <h3>Upload student list (CSV)</h3>
          <p className="muted">You can upload the school ERP file <b>studentReport.csv</b> exactly as it is, or use the simple template.
            Same admission number = record is updated (not duplicated).</p>
          <div className="row-gap">
            <label className="btn btn-primary file-btn">Choose CSV file<input type="file" accept=".csv" onChange={(e) => e.target.files[0] && onFile(e.target.files[0])} /></label>
            <button className="btn btn-ghost" onClick={template}>Download template</button>
          </div>
        </div>
      </div>

      {rows && (
        <>
          <div className="kpis">
            <div className="kpi"><span>File</span><b className="small-b">{fileName}</b></div>
            <div className="kpi"><span>Rows in file</span><b>{rows.length}</b></div>
            <div className="kpi kpi-accent"><span>Ready to import</span><b>{good.length}</b></div>
            <div className="kpi"><span>Problems</span><b className={rows.length - good.length ? 'txt-err' : ''}>{rows.length - good.length}</b></div>
          </div>

          {newClasses.length > 0 && (
            <div className="alert alert-warn">
              <div><b>{newClasses.length} class(es) not in the system:</b> {newClasses.join(', ')}</div>
              <label className="check"><input type="checkbox" checked={createClasses} onChange={(e) => setCreateClasses(e.target.checked)} /> Create these classes automatically</label>
            </div>
          )}
          <label className="check"><input type="checkbox" checked={autoRoll} onChange={(e) => setAutoRoll(e.target.checked)} /> Give roll numbers A–Z where the file has none (use on first import; untick when re-importing)</label>

          <div className="grid-wrap short">
            <table className="grid list-grid">
              <thead><tr><th>#</th><th>Adm No</th><th>Name</th><th>Class</th><th>Father</th><th>Mother</th><th>DOB</th><th>Check</th></tr></thead>
              <tbody>
                {rows.slice(0, 300).map((r, i) => {
                  const p = r.problem || (!known.has(r.class_id) && !createClasses ? 'Unknown class' : '');
                  return (
                    <tr key={i} className={p ? 'row-bad' : ''}>
                      <td>{i + 1}</td><td>{r.admission_number}</td><td>{r.name}</td><td>{r.class_id}</td>
                      <td>{r.father_name}</td><td>{r.mother_name}</td><td>{r.dob}</td><td className={p ? 'txt-err' : 'txt-ok'}>{p || 'OK'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rows.length > 300 && <p className="muted small">Showing first 300 rows of {rows.length}.</p>}

          <div className="savebar">
            <div className="savebar-info">{done !== null ? <span className="txt-ok">✔ {done} students imported successfully</span> : <span>{good.length} students will be added / updated</span>}</div>
            <button className="btn btn-primary" disabled={busy || !good.length} onClick={runImport}>{busy ? 'Importing…' : 'Import Students'}</button>
          </div>
        </>
      )}
      {!rows && <Empty icon="📄" title="No file chosen yet">Columns needed: name, admission_number, class_id (plus optional roll_number, father_name, mother_name, parent_contact, house).</Empty>}
    </div>
  );
}
