import { pool, TZ } from './db.js';

const pad = (n) => String(n).padStart(2, '0');
const round2 = (n) => Math.round(n * 100) / 100;

/** Opening / income / expense / closing per account for one month (month = 1-12). */
export async function computeSummary(year, month) {
  const start = `${year}-${pad(month)}-01 00:00:00`;
  const ny = month === 12 ? year + 1 : year;
  const nm = month === 12 ? 1 : month + 1;
  const end = `${ny}-${pad(nm)}-01 00:00:00`;
  const { rows } = await pool.query(
    `SELECT account_id,
        COALESCE(SUM(CASE WHEN local < $2::timestamp THEN (CASE WHEN type = 'income' THEN amount ELSE -amount END) END), 0) AS opening,
        COALESCE(SUM(CASE WHEN local >= $2::timestamp AND type = 'income' THEN amount END), 0) AS income,
        COALESCE(SUM(CASE WHEN local >= $2::timestamp AND type = 'expense' THEN amount END), 0) AS expense
       FROM (SELECT account_id, type, amount, (date AT TIME ZONE $1) AS local FROM transactions) t
      WHERE local < $3::timestamp
      GROUP BY account_id`,
    [TZ, start, end],
  );
  const { rows: accs } = await pool.query('SELECT id, active FROM accounts ORDER BY sort, created_at');
  const accounts = {};
  const totals = { opening: 0, income: 0, expense: 0, closing: 0 };
  for (const { id, active } of accs) {
    const r = rows.find((x) => x.account_id === id);
    const opening = round2(Number(r?.opening ?? 0));
    const income = round2(Number(r?.income ?? 0));
    const expense = round2(Number(r?.expense ?? 0));
    const closing = round2(opening + income - expense);
    // hide archived accounts that had nothing in this period
    if (!active && !opening && !income && !expense) continue;
    accounts[id] = { opening, income, expense, closing };
    totals.opening += opening;
    totals.income += income;
    totals.expense += expense;
    totals.closing += closing;
  }
  for (const k of Object.keys(totals)) totals[k] = round2(totals[k]);
  return { year, month, accounts, totals };
}

/** True if any of the given dates falls in a closed month. */
export async function touchesClosedMonth(dates) {
  const iso = dates.map((d) => new Date(d).toISOString());
  const { rows } = await pool.query(
    `SELECT 1 FROM period_closes pc
      WHERE (pc.year, pc.month) IN (
        SELECT EXTRACT(YEAR FROM (d AT TIME ZONE $2))::int, EXTRACT(MONTH FROM (d AT TIME ZONE $2))::int
          FROM unnest($1::timestamptz[]) AS d)
      LIMIT 1`,
    [iso, TZ],
  );
  return rows.length > 0;
}

/** Current year/month (1-12) in the business timezone. */
export async function currentPeriod() {
  const { rows } = await pool.query(
    'SELECT EXTRACT(YEAR FROM (now() AT TIME ZONE $1))::int AS y, EXTRACT(MONTH FROM (now() AT TIME ZONE $1))::int AS m',
    [TZ],
  );
  return { year: rows[0].y, month: rows[0].m };
}
