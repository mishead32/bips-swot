export function downloadCSV(filename, rows) {
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = rows.map((r) => r.map(esc).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export const avg = (nums) => {
  const v = nums.filter((x) => x !== null && x !== undefined && x !== '' && !Number.isNaN(Number(x))).map(Number);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

export const fmt = (n, d = 2) => (n === null || n === undefined ? '—' : Number(n).toFixed(d).replace(/\.?0+$/, ''));

export function sortStudents(list) {
  return [...list].sort((a, b) => {
    const ra = a.roll_number ?? 9999;
    const rb = b.roll_number ?? 9999;
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name);
  });
}

/** dd/mm/yyyy or 'dd/mm/yyyy' -> yyyy-mm-dd */
export function parseDMY(s) {
  if (!s) return null;
  const t = String(s).replace(/'/g, '').trim();
  const m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  return null;
}

export const errMsg = (e) => (e && (e.message || e.error_description || e.details)) || String(e);
