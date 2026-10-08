import { Link } from 'react-router-dom';
import { band } from '../lib/config';
import { fmt } from '../lib/util';

/** One value box: average marks (out of 10), academic achieved/planned, attendance % or entry count */
export function AvgCell({ code, r }) {
  if (!r) return <span className="avg-empty">–</span>;
  if (code === 'academic') {
    const pct = Number(r.avg_score);
    return (
      <span className={`avg-box ${pct >= 70 ? 'band-high' : pct >= 40 ? 'band-mid' : 'band-low'}`} title={`${r.entries} mark(s)`}>
        {fmt(r.achieved)}/{fmt(r.planned)}<small>{fmt(pct, 1)}%</small>
      </span>
    );
  }
  if (code === 'attendance') {
    const pct = Number(r.att_pct);
    return <span className={`avg-box ${pct >= 90 ? 'band-high' : pct >= 75 ? 'band-mid' : 'band-low'}`}>{fmt(pct, 1)}%</span>;
  }
  if (r.avg_score != null) return <span className={`avg-box ${band(r.avg_score)}`} title={`${r.entries} box(es) filled`}>{fmt(r.avg_score)}</span>;
  return <span className="avg-box" title="entries">{r.entries}<small>entries</small></span>;
}

/** rows: [{ key, label, sub, to }]; data: { `${key}|${heading}`: row } */
export default function AvgTable({ headings, rows, data, firstCol = 'Class' }) {
  return (
    <div className="grid-wrap">
      <table className="grid avg-grid">
        <thead>
          <tr>
            <th className="sticky-col c-name">{firstCol}</th>
            {headings.map((h, i) => (
              <th key={h.code} className="avg-th" title={h.name}>
                <span className="avg-num">{i + 1}</span>
                <span className="avg-name">{h.name}</span>
                <span className="avg-unit">{h.code === 'academic' ? 'marks got / planned' : h.code === 'attendance' ? '% present' : ['fee', 'ptm', 'hidden_talent'].includes(h.code) ? 'entries' : 'avg / 10'}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="sticky-col c-name">
                {r.to ? <Link className="cls-link" to={r.to}><b>{r.label}</b></Link> : <b>{r.label}</b>}
                {r.sub && <div className="stu-sub">{r.sub}</div>}
              </td>
              {headings.map((h) => <td key={h.code} className="avg-td"><AvgCell code={h.code} r={data[`${r.key}|${h.code}`]} /></td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
