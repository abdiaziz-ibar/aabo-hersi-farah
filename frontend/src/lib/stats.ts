import { AccountId, Transaction } from './types';

export interface YM { y: number; m: number }

const inMonth = (t: Transaction, { y, m }: YM) => {
  const d = new Date(t.date);
  return d.getFullYear() === y && d.getMonth() === m;
};

export function monthTotals(txs: Transaction[], ym: YM) {
  let income = 0;
  let expense = 0;
  for (const t of txs) {
    if (!inMonth(t, ym)) continue;
    if (t.type === 'income') income += t.amount;
    else expense += t.amount;
  }
  return { income, expense };
}

/** Balance of all transactions up to and including the given month. */
export function balanceUpTo(txs: Transaction[], ym: YM, account?: AccountId) {
  const end = new Date(ym.y, ym.m + 1, 1).getTime();
  let bal = 0;
  for (const t of txs) {
    if (account && t.accountId !== account) continue;
    if (new Date(t.date).getTime() >= end) continue;
    bal += t.type === 'income' ? t.amount : -t.amount;
  }
  return bal;
}

/** The `n` months ending at `ym`, oldest first. */
export function lastMonths(ym: YM, n: number): YM[] {
  const out: YM[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(ym.y, ym.m - i, 1);
    out.push({ y: d.getFullYear(), m: d.getMonth() });
  }
  return out;
}

export interface Slice { label: string; value: number; pct: number }

/** Expenses of a month grouped by place: top `top` plus "Kale". */
export function expensesByPlace(txs: Transaction[], ym: YM, top = 3): Slice[] {
  const map = new Map<string, number>();
  let total = 0;
  for (const t of txs) {
    if (t.type !== 'expense' || !inMonth(t, ym)) continue;
    map.set(t.place, (map.get(t.place) ?? 0) + t.amount);
    total += t.amount;
  }
  if (total === 0) return [];
  const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]);
  const head = sorted.slice(0, top);
  const rest = sorted.slice(top).reduce((s, [, v]) => s + v, 0);
  const slices = head.map(([label, value]) => ({ label, value }));
  if (rest > 0) {
    const kale = slices.find((s) => s.label === 'Kale');
    if (kale) kale.value += rest;
    else slices.push({ label: 'Kale', value: rest });
  }
  return slices.map((s) => ({ ...s, pct: Math.round((s.value / total) * 100) }));
}
