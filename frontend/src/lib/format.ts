import { shortMonthName } from '../i18n';

export const shortMonth = (m: number) => shortMonthName(m);

export function money(n: number): string {
  const neg = n < 0;
  const [int, dec] = Math.abs(n).toFixed(2).split('.');
  const withCommas = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}$${withCommas}${dec === '00' ? '' : '.' + dec}`;
}

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${shortMonth(d.getMonth())}`;
}

export const HIDDEN = '••••••';

export const fmtLong = (iso: string) => {
  const d = new Date(iso);
  return `${d.getDate()} ${shortMonth(d.getMonth())} ${d.getFullYear()}`;
};

/** yyyy-mm-dd of today in the browser's timezone (for <input type="date">). */
export function todayInput(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Date picked in the form → ISO. Today keeps the current time; other days use noon. */
export function inputToIso(v: string): string {
  return v === todayInput() ? new Date().toISOString() : new Date(`${v}T12:00:00`).toISOString();
}
