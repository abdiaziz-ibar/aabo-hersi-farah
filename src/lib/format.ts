export const MONTHS = [
  'Janaayo', 'Febraayo', 'Maarso', 'Abriil', 'Maajo', 'Juun',
  'Luuliyo', 'Ogosto', 'Sebtembar', 'Oktoobar', 'Nofembar', 'Desembar',
];

export const shortMonth = (m: number) => MONTHS[m].slice(0, 3);

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
