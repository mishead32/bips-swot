export function evalGrade(code, total, max) {
  if (total == null) return '';
  if (code === 'notebook') {
    const t = Number(total);
    if (t >= 8) return 'Excellent';
    if (t >= 5) return 'Needs Monitoring';
    return 'Critical';
  }
  const pct = max ? (Number(total) / Number(max)) * 100 : 0;
  if (pct >= 80) return 'Excellent';
  if (pct >= 50) return 'Good';
  return 'Needs Improvement';
}

export function gradeClass(g) {
  if (g === 'Excellent') return 'band-high';
  if (g === 'Good' || g === 'Needs Monitoring') return 'band-mid';
  return 'band-low';
}

/** group criteria by section, keeping order */
export function sections(criteria) {
  const out = [];
  criteria.forEach((c) => {
    let s = out.find((x) => x.name === c.section);
    if (!s) { s = { name: c.section, items: [] }; out.push(s); }
    s.items.push(c);
  });
  return out;
}

export const dmyFull = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '');
