export const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ');

export const initial = (name?: string | null) => (name ?? '?').trim().charAt(0).toUpperCase() || '?';

const WD = ['일', '월', '화', '수', '목', '금', '토'];
export function fmtDate(s: string | null | undefined, withDay = false) {
  if (!s) return '';
  const d = new Date(s.length <= 10 ? s + 'T00:00:00' : s);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}${withDay ? ` (${WD[d.getDay()]})` : ''}`;
}
export function fmtTime(s: string | null | undefined) {
  if (!s) return '';
  const d = new Date(s);
  return `${fmtDate(s)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
export const pct = (x: number | null | undefined) => (x == null ? '-' : `${Math.round(x)}%`);
export const num = (x: number | null | undefined, d = 2) => (x == null ? '-' : x.toFixed(d));
