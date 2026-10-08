// ---- School settings — change here if needed ----
export const SCHOOL_NAME = 'Bhupindra International Public School';
export const SCHOOL_SHORT = 'BIPS';
export const SCHOOL_PLACE = 'Opposite Deer Park, Near Sheesh Mahal, Dakala Road, Patiala-147001';

// Sessions shown in the Report page. First = default.
export const SESSIONS = ['2026-27', '2027-28', '2028-29'];

// Session runs April -> March. Labels match the SWOT sheet.
export const MONTHS = [
  { n: 4, short: 'Apr', label: 'April' },
  { n: 5, short: 'May', label: 'May', tag: 'Periodic Test I' },
  { n: 6, short: 'Jun', label: 'June', tag: 'Evaluation of Assignments' },
  { n: 7, short: 'Jul', label: 'July', tag: 'Periodic Test II' },
  { n: 8, short: 'Aug', label: 'August' },
  { n: 9, short: 'Sep', label: 'September', tag: 'Term I' },
  { n: 10, short: 'Oct', label: 'October' },
  { n: 11, short: 'Nov', label: 'November' },
  { n: 12, short: 'Dec', label: 'December' },
  { n: 1, short: 'Jan', label: 'January' },
  { n: 2, short: 'Feb', label: 'February' },
  { n: 3, short: 'Mar', label: 'March', tag: 'Term II' },
];
export const monthLabel = (n) => MONTHS.find((x) => x.n === Number(n))?.label || String(n);
export const monthShort = (n) => MONTHS.find((x) => x.n === Number(n))?.short || String(n);
export const monthOrder = (n) => MONTHS.findIndex((x) => x.n === Number(n));

/** '2026-10' -> { year: 2026, month: 10, session: '2026-27' } */
export function parseYM(ym) {
  const [y, m] = ym.split('-').map(Number);
  const start = m >= 4 ? y : y - 1;
  return { year: y, month: m, session: `${start}-${String((start + 1) % 100).padStart(2, '0')}` };
}
export const ymOf = (dateStr) => dateStr.slice(0, 7);
export const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const ymLabel = (ym) => { const { year, month } = parseYM(ym); return `${monthLabel(month)} ${year}`; };
/** calendar year of a month inside a session: ('2026-27', 1) -> 2027 */
export const yearOf = (session, month) => Number(session.slice(0, 4)) + (month < 4 ? 1 : 0);

export function previousYM(ym) {
  const { year, month } = parseYM(ym);
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;
}

// Colour band for marks out of 10
export function band(score) {
  if (score === null || score === undefined || score === '' || Number.isNaN(Number(score))) return '';
  const s = Number(score);
  if (s >= 7) return 'band-high';
  if (s >= 4) return 'band-mid';
  return 'band-low';
}

// Talent level (Music / Dance / Art & Craft) — from the sheet
export function talentLevel(v) {
  const s = Number(v);
  if (!v || Number.isNaN(s)) return '';
  if (s <= 2) return 'Beginner';
  if (s <= 4) return 'Developing';
  if (s <= 6) return 'Partial Mastery';
  return 'Mastery / Exemplary';
}

export const SPORTS_LEVELS = ['Beginner', 'Inter-house', 'Inter-School', 'Zonals', 'District', 'Nationals', 'International'];
export const TEST_TYPES = ['Weekly Test', 'Periodic Test I', 'Periodic Test II', 'Revision Test', 'Half Yearly Exam', 'Assignment', 'Final Exam'];
export const GRADES = ['A+', 'A', 'B+', 'B', 'C', 'D', 'E'];
export const FEE_OPTIONS = ['Paid', 'Pending', 'NA'];
export const PTM_OPTIONS = ['P', 'A', 'NA'];
