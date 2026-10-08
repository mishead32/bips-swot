import { MONTHS } from '../lib/config';

export function ClassSelect({ classes, value, onChange }) {
  const wings = [...new Set(classes.map((c) => c.wing || 'Other'))];
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">— Select class —</option>
      {wings.map((w) => (
        <optgroup key={w} label={w}>
          {classes.filter((c) => (c.wing || 'Other') === w).map((c) => <option key={c.id} value={c.id}>{c.id}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

export function MonthSelect({ value, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {MONTHS.map((m) => <option key={m.n} value={m.n}>{m.label}{m.tag ? ` — ${m.tag}` : ''}</option>)}
    </select>
  );
}
