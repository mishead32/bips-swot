import { SPORTS_LEVELS, FEE_OPTIONS, PTM_OPTIONS } from '../../lib/config';

export const cellKey = (sid, itemId) => `${sid}|${itemId}`;

/** DB row -> what the input box shows */
export function rowToRaw(type, r) {
  if (!r) return type === 'video' ? { cap: '', link: '' } : '';
  switch (type) {
    case 'score10': return r.value_text === 'NA' ? 'NA' : r.value_num == null ? '' : String(Number(r.value_num));
    case 'level10':
    case 'attendance': return r.value_num == null ? '' : String(Number(r.value_num));
    case 'video': return { cap: r.value_text2 || '', link: r.value_text || '' };
    default: return r.value_text || '';
  }
}

export const isEmpty = (type, raw) => (type === 'video' ? !raw || (!raw.link?.trim() && !raw.cap?.trim()) : raw === '' || raw == null);

export const sameRaw = (type, a, b) =>
  type === 'video' ? (a?.cap || '') === (b?.cap || '') && (a?.link || '') === (b?.link || '') : (a || '') === (b || '');

/** returns '' when OK, else a short error */
export function validate(type, raw, workingDays) {
  if (isEmpty(type, raw)) return '';
  const num = /^\d{1,3}(\.\d{1,2})?$/;
  switch (type) {
    case 'score10':
      if (raw.toUpperCase() === 'NA') return '';
      return num.test(raw) && Number(raw) <= 10 ? '' : '0–10 or NA';
    case 'level10':
      return num.test(raw) && Number(raw) >= 1 && Number(raw) <= 10 ? '' : '1–10';
    case 'attendance':
      if (!/^\d{1,2}$/.test(raw)) return 'days';
      if (!workingDays) return 'set working days';
      return Number(raw) <= Number(workingDays) ? '' : `max ${workingDays}`;
    case 'sports': return SPORTS_LEVELS.includes(raw) ? '' : 'level';
    case 'fee': return FEE_OPTIONS.includes(raw) ? '' : 'Paid/Pending';
    case 'ptm': return PTM_OPTIONS.includes(raw) ? '' : 'P/A/NA';
    case 'video':
      if (!raw.link?.trim()) return 'link missing';
      return /^https?:\/\//i.test(raw.link.trim()) ? '' : 'link must start with http';
    default: return '';
  }
}

/** input box -> DB columns */
export function rawToRow(type, raw, workingDays) {
  switch (type) {
    case 'score10':
      return raw.toUpperCase() === 'NA' ? { value_num: null, value_text: 'NA' } : { value_num: Number(raw), value_text: null };
    case 'level10': return { value_num: Number(raw) };
    case 'attendance': return { value_num: Number(raw), value_num2: Number(workingDays) };
    case 'video': return { value_text: raw.link.trim(), value_text2: raw.cap?.trim() || null };
    default: return { value_text: raw };
  }
}

/** compact text for a locked (saved) box */
export function display(type, r) {
  if (!r) return '';
  switch (type) {
    case 'score10': return r.value_text === 'NA' ? 'NA' : String(Number(r.value_num));
    case 'level10': return String(Number(r.value_num));
    case 'attendance': return `${Number(r.value_num)}/${r.value_num2 == null ? '?' : Number(r.value_num2)}`;
    case 'video': return r.value_text2 || 'Video';
    default: return r.value_text || '';
  }
}
