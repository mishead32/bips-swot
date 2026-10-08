import { todayStr } from '../lib/config';

const pad = (n) => String(n).padStart(2, '0');
const lastDay = (y, m) => new Date(y, m, 0).getDate();

/** period = { mode: 'this'|'last'|'month'|'range', ym, from, to } -> { from, to, label } */
export function periodRange(p) {
  const t = todayStr();
  const y = Number(t.slice(0, 4));
  const m = Number(t.slice(5, 7));
  const monthName = (yy, mm) => new Date(yy, mm - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
  if (p.mode === 'last') {
    const ly = m === 1 ? y - 1 : y;
    const lm = m === 1 ? 12 : m - 1;
    return { from: `${ly}-${pad(lm)}-01`, to: `${ly}-${pad(lm)}-${lastDay(ly, lm)}`, label: monthName(ly, lm) };
  }
  if (p.mode === 'month' && p.ym) {
    const yy = Number(p.ym.slice(0, 4));
    const mm = Number(p.ym.slice(5, 7));
    return { from: `${p.ym}-01`, to: `${p.ym}-${lastDay(yy, mm)}`, label: monthName(yy, mm) };
  }
  if (p.mode === 'range' && p.from && p.to) {
    const f = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
    return { from: p.from, to: p.to, label: `${f(p.from)} to ${f(p.to)}` };
  }
  return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${lastDay(y, m)}`, label: monthName(y, m) };
}

export const defaultPeriod = () => ({ mode: 'this', ym: todayStr().slice(0, 7), from: `${todayStr().slice(0, 7)}-01`, to: todayStr() });

export default function PeriodFilter({ value, onChange }) {
  const set = (o) => onChange({ ...value, ...o });
  return (
    <div className="period">
      <div className="seg">
        {[['this', 'This month'], ['last', 'Last month'], ['month', 'Month'], ['range', 'From – To']].map(([k, l]) => (
          <button key={k} type="button" className={value.mode === k ? 'on' : ''} onClick={() => set({ mode: k })}>{l}</button>
        ))}
      </div>
      {value.mode === 'month' && <input type="month" value={value.ym} onChange={(e) => e.target.value && set({ ym: e.target.value })} />}
      {value.mode === 'range' && (
        <div className="range">
          <input type="date" value={value.from} onChange={(e) => set({ from: e.target.value })} />
          <span>to</span>
          <input type="date" value={value.to} min={value.from} onChange={(e) => set({ to: e.target.value })} />
        </div>
      )}
    </div>
  );
}
