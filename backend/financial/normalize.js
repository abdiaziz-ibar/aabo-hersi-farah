/** Field validators / normalisers shared by both source parsers. Each returns { value } or { error }. */

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const TZ_OFFSET = /^[+-]\d{2}:\d{2}$/.test(process.env.FIN_TZ_OFFSET ?? '') ? process.env.FIN_TZ_OFFSET : '+03:00'; // Africa/Mogadishu

const pad = (n) => String(n).padStart(2, '0');

export function parseDate(raw, dateOrder = 'DMY') {
  const s = String(raw ?? '').trim();
  if (!s) return { error: 'date is missing' };
  let y, mo, d, h = 0, mi = 0, sec = 0, offset = null;
  let m;
  const time = (str) => {
    const t = /(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*(AM|PM)?\s*(Z|[+-]\d{2}:?\d{2})?/i.exec(str ?? '');
    if (!t) return;
    h = Number(t[1]); mi = Number(t[2]); sec = Number(t[3] ?? 0);
    if (t[4]) { const pm = t[4].toUpperCase() === 'PM'; if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12; }
    if (t[5]) offset = t[5].toUpperCase() === 'Z' ? '+00:00' : t[5].replace(/^([+-]\d{2})(\d{2})$/, '$1:$2');
  };
  if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s,]+(.*))?$/.exec(s))) {
    [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]; time(m[4]);
  } else if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[T\s,]+(.*))?$/.exec(s))) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    y = Number(m[3]); time(m[4]);
    if (a > 12) [d, mo] = [a, b];
    else if (b > 12) [mo, d] = [a, b];
    else if (dateOrder === 'MDY') [mo, d] = [a, b];
    else [d, mo] = [a, b];
  } else if ((m = /^(\d{1,2})[\s-]+([A-Za-z]{3})[a-z]*[\s,-]+(\d{4})(?:[T\s,]+(.*))?$/.exec(s))) {
    [d, mo, y] = [Number(m[1]), MONTHS[m[2].toLowerCase()], Number(m[3])]; time(m[4]);
    if (!mo) return { error: `unrecognised month in date "${s}"` };
  } else {
    return { error: `unrecognised date format "${s}"` };
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || sec > 59) return { error: `invalid date "${s}"` };
  // reject impossible calendar days such as 31 Feb (JS would silently roll them over)
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return { error: `invalid date "${s}"` };
  const dt = new Date(`${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}:${pad(sec)}${offset ?? TZ_OFFSET}`);
  if (Number.isNaN(+dt)) return { error: `invalid date "${s}"` };
  if (y < 2000 || dt.getTime() > Date.now() + 36 * 3600e3) return { error: `date "${s}" is out of range` };
  return { value: dt };
}

/** Returns { value: Number (negative if the file marks it so), negative } rounded to 2 decimals. */
export function parseAmount(raw) {
  let s = String(raw ?? '').trim();
  if (!s) return { error: 'amount is missing' };
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (/-$/.test(s)) { neg = true; s = s.slice(0, -1); }
  if (/^-/.test(s)) { neg = true; s = s.slice(1); }
  s = s.replace(/^\+/, '').replace(/SOS|USD|SLSH/gi, '').replace(/[A-Za-z$€£\s ]/g, '');
  if (!/^[\d.,]+$/.test(s)) return { error: `amount "${raw}" is not a number` };
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    s = lastDot > lastComma ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(',', '.');
  } else if (lastComma >= 0) {
    s = /,\d{1,2}$/.test(s) && s.indexOf(',') === lastComma ? s.replace(',', '.') : s.replace(/,/g, '');
  }
  if ((s.match(/\./g) ?? []).length > 1) return { error: `amount "${raw}" is not a number` };
  const n = Number(s);
  if (!Number.isFinite(n)) return { error: `amount "${raw}" is not a number` };
  if (n > 1e12) return { error: `amount "${raw}" is too large` };
  const v = Math.round(n * 100) / 100;
  return { value: neg ? -v : v, negative: neg };
}

/** Digits-only phone. Somali mobile numbers without a country code get 252 prepended. */
export function normalizePhone(raw) {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0') && d.length === 10) d = d.slice(1); // 06x xxx xxxx
  if (/^[679]\d{8}$/.test(d)) d = `252${d}`;
  return d;
}

export function parsePhone(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return { value: null };
  const d = normalizePhone(s);
  if (d.length < 7 || d.length > 15) return { error: `phone "${s}" must have 7-15 digits` };
  return { value: d };
}

export function parseTxId(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return { value: null };
  if (s.length > 100) return { error: 'transaction ID is longer than 100 characters' };
  if (/[\u0000-\u001f]/.test(s)) return { error: 'transaction ID has control characters' };
  return { value: s };
}

export function parseCurrency(raw, fallback) {
  const s = String(raw ?? '').trim().toUpperCase();
  if (!s) return { value: fallback };
  const v = { $: 'USD', US$: 'USD', SSH: 'SOS' }[s] ?? s;
  if (!/^[A-Z]{2,5}$/.test(v)) return { error: `currency "${raw}" is not valid` };
  return { value: v };
}

export const cleanText = (raw, max = 300) => {
  const s = String(raw ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, max) : null;
};
