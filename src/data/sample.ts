import { Transaction } from './types';

/** Deterministic demo data covering the last 6 months. */
export function makeSample(now = new Date()): Transaction[] {
  const out: Transaction[] = [];
  let n = 0;
  const add = (
    off: number, day: number, type: Transaction['type'], amount: number,
    accountId: Transaction['accountId'], party: string, place: string,
  ) => {
    const d = new Date(now.getFullYear(), now.getMonth() - off, 1, 12);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last, off === 0 ? now.getDate() : last));
    out.push({ id: `s${n++}`, type, amount, accountId, party, place, date: d.toISOString() });
  };
  for (let o = 0; o < 6; o++) {
    const v = ((o * 7) % 5) * 40;
    add(o, 1, 'income', 1400 + v, 'saadicuun', 'Mushaar', 'Shaqo');
    add(o, 3, 'expense', 320, 'saadicuun', 'Kirada', 'Guri');
    add(o, 4, 'expense', 90 + v / 2, 'xaafada', 'Suuqa', 'Suuq');
    add(o, 2, 'income', 150 + v, 'shakhsi', 'Axmed', 'Lacag dhiibasho');
    add(o, 5, 'expense', 60 + (o % 3) * 15, 'shakhsi', 'Shidaal', 'Gaadiid');
    add(o, 5, 'expense', 45, 'xaafada', 'Korontada', 'Guri');
    add(o, 6, 'expense', 130 + v / 4, 'xaafada', 'Maqaaya', 'Cunto');
    if (o !== 0) {
      add(o, 18, 'expense', 110 + v / 2, 'shakhsi', 'Suuqa', 'Suuq');
      add(o, 21, 'expense', 25, 'shakhsi', 'Xawaalad', 'Kale');
    }
  }
  return out;
}
