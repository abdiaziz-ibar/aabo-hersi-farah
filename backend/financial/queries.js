import { TZ, pool } from '../db.js';
import { normalizePhone } from './normalize.js';

export class QueryError extends Error {}

const SOURCES = ['EVC_PLUS', 'SALAAM_BANK'];
const TYPES = ['SENT', 'RECEIVED', 'TRANSFER'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const str = (v) => (typeof v === 'string' ? v.trim() : '');
const likeEsc = (s) => s.replace(/[\\%_]/g, '\\$&');

/** Validate query-string filters (everything is later passed as bound parameters, never concatenated). */
export function parseFilters(q = {}) {
  const f = {};
  const name = str(q.name).slice(0, 100);
  if (name) f.nameTokens = name.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6).map((t) => `%${likeEsc(t)}%`);
  const phone = str(q.phone);
  if (phone) {
    const digits = phone.replace(/\D/g, '');
    if (!digits) throw new QueryError('Phone number must contain digits.');
    f.exact = q.exact === 'true' || q.exact === '1';
    f.phone = f.exact ? normalizePhone(phone) : `%${digits.replace(/^0+/, '') || digits}%`;
  }
  const txId = str(q.txId).slice(0, 100);
  if (txId) f.txId = `%${likeEsc(txId.toLowerCase())}%`;
  if (str(q.source)) {
    if (!SOURCES.includes(q.source)) throw new QueryError('Unknown source.');
    f.source = q.source;
  }
  if (str(q.type)) {
    if (!TYPES.includes(q.type)) throw new QueryError('Unknown transaction type.');
    f.type = q.type;
  }
  for (const k of ['from', 'to']) {
    if (str(q[k])) {
      if (!DATE_RE.test(q[k]) || Number.isNaN(+new Date(q[k]))) throw new QueryError(`"${k}" must be a date like 2025-01-31.`);
      f[k] = q[k];
    }
  }
  for (const [k, p] of [['min', 'minAmount'], ['max', 'maxAmount']]) {
    if (str(q[p])) {
      const n = Number(q[p]);
      if (!Number.isFinite(n) || n < 0) throw new QueryError(`${p} must be a positive number.`);
      f[k] = n;
    }
  }
  if (f.min != null && f.max != null && f.min > f.max) throw new QueryError('Minimum amount is greater than the maximum amount.');
  if (str(q.currency)) {
    if (!/^[A-Za-z]{2,5}$/.test(q.currency)) throw new QueryError('Invalid currency.');
    f.currency = q.currency.toUpperCase();
  }
  if (str(q.customer)) f.customer = parseCustomerKey(q.customer);
  return f;
}

/** Customer identity: "p:<digits>" (phone) or "n:<lowercase name>" for people without a phone number. */
export function parseCustomerKey(k) {
  const s = str(k);
  if (/^p:\d{7,15}$/.test(s)) return { kind: 'p', val: s.slice(2), key: s };
  if (/^n:.{1,150}$/.test(s)) return { kind: 'n', val: s.slice(2).toLowerCase(), key: `n:${s.slice(2).toLowerCase()}` };
  throw new QueryError('Invalid customer key.');
}

class Params {
  constructor() { this.list = []; }
  add(v) { this.list.push(v); return `$${this.list.length}`; }
}

const sideMatch = (p, prm, c) => (c.kind === 'p'
  ? `COALESCE(ft.${p}_phone = ${prm.add(c.val)}, false)` // COALESCE: a NULL phone must mean "no", not NULL, inside NOT(...)
  : `(ft.${p}_phone IS NULL AND lower(ft.${p}_name) = ${prm.add(c.val)})`);

/** WHERE clause (without the word WHERE) over financial_transactions aliased as ft. */
export function buildWhere(f, prm, { skipCurrency = false } = {}) {
  const w = ['TRUE'];
  if (f.source) w.push(`ft.source = ${prm.add(f.source)}`);
  if (f.type) w.push(`ft.transaction_type = ${prm.add(f.type)}`);
  if (f.from) w.push(`ft.transaction_date >= (${prm.add(f.from)}::date::timestamp AT TIME ZONE ${prm.add(TZ)})`);
  if (f.to) w.push(`ft.transaction_date < ((${prm.add(f.to)}::date + 1)::timestamp AT TIME ZONE ${prm.add(TZ)})`);
  if (f.min != null) w.push(`ft.amount >= ${prm.add(f.min)}`);
  if (f.max != null) w.push(`ft.amount <= ${prm.add(f.max)}`);
  if (f.currency && !skipCurrency) w.push(`ft.currency = ${prm.add(f.currency)}`);
  if (f.txId) w.push(`lower(ft.transaction_id) LIKE ${prm.add(f.txId)}`);
  if (f.nameTokens || f.phone) {
    // the SAME person (one side of the transaction) must match both the name and the phone
    const nameP = f.nameTokens ? prm.add(f.nameTokens) : null;
    const phoneP = f.phone ? prm.add(f.phone) : null;
    const side = (p) => {
      const parts = [];
      if (nameP) parts.push(`lower(ft.${p}_name) LIKE ALL(${nameP}::text[])`);
      if (phoneP) parts.push(f.exact ? `ft.${p}_phone = ${phoneP}` : `ft.${p}_phone LIKE ${phoneP}`);
      return `(${parts.join(' AND ')})`;
    };
    w.push(`(${side('sender')} OR ${side('receiver')})`);
  }
  if (f.customer) w.push(`(${sideMatch('sender', prm, f.customer)} OR ${sideMatch('receiver', prm, f.customer)})`);
  return w.join(' AND ');
}

const SORTS = {
  date: 'ft.transaction_date', amount: 'ft.amount', id: 'lower(ft.transaction_id)', sender: 'lower(ft.sender_name)',
  receiver: 'lower(ft.receiver_name)', source: 'ft.source', type: 'ft.transaction_type', currency: 'ft.currency',
};

const TX_COLS = `ft.id, ft.source, ft.transaction_id, ft.transaction_date, ft.sender_name, ft.sender_phone, ft.receiver_name,
  ft.receiver_phone, ft.amount, ft.currency, ft.transaction_type, ft.description, ft.reference_number`;

const toTx = (r) => ({ ...r, amount: Number(r.amount), transaction_date: r.transaction_date.toISOString() });

export function pageOpts(q = {}, maxSize = 200) {
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const pageSize = Math.min(maxSize, Math.max(1, parseInt(q.pageSize, 10) || 25));
  const sort = SORTS[q.sort] ? q.sort : 'date';
  const dir = q.dir === 'asc' ? 'ASC' : 'DESC';
  return { page, pageSize, sort, dir };
}

/** All matching transactions, paginated + sorted, with a per-currency summary of the full result set. */
export async function listTransactions(f, q) {
  const { page, pageSize, sort, dir } = pageOpts(q);
  const prm = new Params();
  const where = buildWhere(f, prm);
  const order = `${SORTS[sort]} ${dir} NULLS LAST, ft.id`;
  const limit = prm.add(pageSize);
  const offset = prm.add((page - 1) * pageSize);
  const [rows, sum] = await Promise.all([
    pool.query(`SELECT ${TX_COLS} FROM financial_transactions ft WHERE ${where} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`, prm.list),
    pool.query(`SELECT ft.currency, COUNT(*)::int AS count, COALESCE(SUM(ft.amount),0) AS volume
                  FROM financial_transactions ft WHERE ${where} GROUP BY ft.currency ORDER BY count DESC`, prm.list.slice(0, -2)),
  ]);
  const total = sum.rows.reduce((s, r) => s + r.count, 0);
  return {
    rows: rows.rows.map(toTx), total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)),
    summary: sum.rows.map((r) => ({ currency: r.currency, count: r.count, volume: Number(r.volume) })),
  };
}

/** Every matching row (for exports), capped. */
export async function allTransactions(f, q, max) {
  const { sort, dir } = pageOpts(q);
  const prm = new Params();
  const where = buildWhere(f, prm);
  const { rows } = await pool.query(
    `SELECT ${TX_COLS} FROM financial_transactions ft WHERE ${where} ORDER BY ${SORTS[sort]} ${dir} NULLS LAST, ft.id LIMIT ${prm.add(max + 1)}`, prm.list);
  return rows.map(toTx);
}

/** People that match the name / phone / transaction-id search, with totals counted once per transaction. */
export async function searchCustomers(f, limit = 50) {
  const prm = new Params();
  const where = buildWhere(f, prm);
  const pw = ['(phone IS NOT NULL OR name IS NOT NULL)'];
  if (f.nameTokens) pw.push(`lower(name) LIKE ALL(${prm.add(f.nameTokens)}::text[])`);
  if (f.phone) pw.push(f.exact ? `phone = ${prm.add(f.phone)}` : `phone LIKE ${prm.add(f.phone)}`);
  const { rows } = await pool.query(`
    WITH m AS (
      SELECT ft.id, ft.source, ft.amount, ft.currency, ft.transaction_date, ft.sender_name, ft.sender_phone, ft.receiver_name, ft.receiver_phone,
             COALESCE(ft.sender_phone, 'n:' || lower(COALESCE(ft.sender_name, ''))) = COALESCE(ft.receiver_phone, 'n:' || lower(COALESCE(ft.receiver_name, ''))) AS self
        FROM financial_transactions ft WHERE ${where}),
    p AS (
      SELECT id, source, amount, currency, transaction_date AS at, sender_name AS name, sender_phone AS phone, 'S' AS side, self FROM m
      UNION ALL
      SELECT id, source, amount, currency, transaction_date, receiver_name, receiver_phone, 'R', self FROM m),
    agg AS (
      SELECT COALESCE('p:' || phone, 'n:' || lower(name)) AS key, currency,
             (array_agg(name ORDER BY name) FILTER (WHERE name IS NOT NULL))[1] AS name, max(phone) AS phone,
             COUNT(DISTINCT id)::int AS count,
             COALESCE(SUM(amount) FILTER (WHERE side = 'R' AND NOT self), 0) AS received,
             COALESCE(SUM(amount) FILTER (WHERE side = 'S' AND NOT self), 0) AS sent,
             COALESCE(SUM(amount) FILTER (WHERE side = 'S' AND self), 0) AS transfers,
             min(at) AS first_at, max(at) AS last_at, array_agg(DISTINCT source) AS sources
        FROM p WHERE ${pw.join(' AND ')} GROUP BY 1, 2)
    SELECT key, (array_agg(name ORDER BY count DESC))[1] AS name, max(phone) AS phone, SUM(count)::int AS count,
           min(first_at) AS first_at, max(last_at) AS last_at,
           jsonb_agg(jsonb_build_object('currency', currency, 'count', count, 'received', received, 'sent', sent, 'transfers', transfers) ORDER BY count DESC) AS totals
      FROM agg GROUP BY key ORDER BY SUM(count) DESC, key LIMIT ${prm.add(limit)}`, prm.list);
  return rows.map((r) => ({
    key: r.key, name: r.name, phone: r.phone, count: r.count,
    firstAt: r.first_at?.toISOString() ?? null, lastAt: r.last_at?.toISOString() ?? null,
    totals: r.totals.map(totalsOut),
  }));
}

const totalsOut = (t) => {
  const received = Number(t.received);
  const sent = Number(t.sent);
  return { currency: t.currency, count: Number(t.count), received, sent, transfers: Number(t.transfers), net: Math.round((received - sent) * 100) / 100 };
};

/**
 * Full profile of one customer. Each transaction is counted ONCE:
 *   received  = they are the receiver and not the sender
 *   sent      = they are the sender and not the receiver
 *   transfers = they are both (money moved between their own entries), shown separately and never added to either total
 */
export async function customerProfile(f) {
  const c = f.customer;
  const prm = new Params();
  const where = buildWhere(f, prm);
  const isS = sideMatch('sender', prm, c);
  const isR = sideMatch('receiver', prm, c);
  const { rows } = await pool.query(`
    SELECT ft.source, ft.currency, COUNT(*)::int AS count,
           COALESCE(SUM(ft.amount) FILTER (WHERE ${isR} AND NOT (${isS})), 0) AS received,
           COALESCE(SUM(ft.amount) FILTER (WHERE ${isS} AND NOT (${isR})), 0) AS sent,
           COALESCE(SUM(ft.amount) FILTER (WHERE ${isS} AND ${isR}), 0) AS transfers,
           min(ft.transaction_date) AS first_at, max(ft.transaction_date) AS last_at
      FROM financial_transactions ft WHERE ${where} GROUP BY ft.source, ft.currency`, prm.list);
  if (!rows.length) return null;

  const names = new Map();
  const nprm = new Params();
  const nwhere = buildWhere(f, nprm);
  const nS = sideMatch('sender', nprm, c);
  const nR = sideMatch('receiver', nprm, c);
  const nm = await pool.query(`
    SELECT n AS name, COUNT(*)::int AS c FROM (
      SELECT CASE WHEN ${nS} THEN ft.sender_name WHEN ${nR} THEN ft.receiver_name END AS n
        FROM financial_transactions ft WHERE ${nwhere}) x
     WHERE n IS NOT NULL GROUP BY n ORDER BY c DESC, n LIMIT 5`, nprm.list);
  nm.rows.forEach((r) => names.set(r.name, r.c));

  const byCur = new Map();
  let count = 0;
  let first = null;
  let last = null;
  for (const r of rows) {
    count += r.count;
    if (!first || r.first_at < first) first = r.first_at;
    if (!last || r.last_at > last) last = r.last_at;
    const t = byCur.get(r.currency) ?? { currency: r.currency, count: 0, received: 0, sent: 0, transfers: 0 };
    t.count += r.count; t.received += Number(r.received); t.sent += Number(r.sent); t.transfers += Number(r.transfers);
    byCur.set(r.currency, t);
  }
  return {
    key: c.key,
    name: [...names.keys()][0] ?? null,
    otherNames: [...names.keys()].slice(1),
    phone: c.kind === 'p' ? c.val : null,
    count,
    firstAt: first.toISOString(),
    lastAt: last.toISOString(),
    totals: [...byCur.values()].map(totalsOut).sort((a, b) => b.count - a.count),
    bySource: rows.map((r) => ({ source: r.source, ...totalsOut(r) })).sort((a, b) => a.source.localeCompare(b.source) || b.count - a.count),
  };
}

/* ------------------------------ reports ------------------------------ */

/** Reports work in one currency at a time: the requested one, else the most-used in the filtered data. */
async function reportCurrency(f) {
  const prm = new Params();
  const where = buildWhere({ ...f, currency: undefined }, prm, { skipCurrency: true });
  const { rows } = await pool.query(
    `SELECT ft.currency, COUNT(*)::int AS c FROM financial_transactions ft WHERE ${where} GROUP BY ft.currency ORDER BY c DESC`, prm.list);
  const currencies = rows.map((r) => r.currency);
  return { currency: f.currency && currencies.includes(f.currency) ? f.currency : currencies[0] ?? null, currencies };
}

const PERIODS = {
  daily: { trunc: 'day', fmt: 'YYYY-MM-DD' },
  weekly: { trunc: 'week', fmt: 'YYYY-MM-DD' }, // Monday of the week
  monthly: { trunc: 'month', fmt: 'YYYY-MM' },
};

const money = (v) => Number(v ?? 0);

export async function reportSummary(f, periodName = 'daily') {
  const per = PERIODS[periodName] ?? PERIODS.daily;
  const { currency, currencies } = await reportCurrency(f);
  if (!currency) return { currency: null, currencies: [], period: periodName, totals: null, series: [], sources: [] };
  const base = { ...f, currency };

  const p1 = new Params();
  const w1 = buildWhere(base, p1);
  const tz = p1.add(TZ);
  const series = await pool.query(`
    SELECT to_char(date_trunc('${per.trunc}', ft.transaction_date AT TIME ZONE ${tz}), '${per.fmt}') AS period,
           COUNT(*)::int AS count, SUM(ft.amount) AS volume,
           COALESCE(SUM(ft.amount) FILTER (WHERE ft.transaction_type = 'RECEIVED'), 0) AS received,
           COALESCE(SUM(ft.amount) FILTER (WHERE ft.transaction_type = 'SENT'), 0) AS sent,
           COALESCE(SUM(ft.amount) FILTER (WHERE ft.transaction_type = 'TRANSFER'), 0) AS transfers
      FROM financial_transactions ft WHERE ${w1} GROUP BY 1 ORDER BY 1 DESC LIMIT 400`, p1.list);

  const p2 = new Params();
  const w2 = buildWhere(base, p2);
  const sources = await pool.query(`
    SELECT ft.source, COUNT(*)::int AS count, SUM(ft.amount) AS volume, AVG(ft.amount) AS average, MAX(ft.amount) AS largest,
           COALESCE(SUM(ft.amount) FILTER (WHERE ft.transaction_type = 'RECEIVED'), 0) AS received,
           COALESCE(SUM(ft.amount) FILTER (WHERE ft.transaction_type = 'SENT'), 0) AS sent,
           COALESCE(SUM(ft.amount) FILTER (WHERE ft.transaction_type = 'TRANSFER'), 0) AS transfers,
           min(ft.transaction_date) AS first_at, max(ft.transaction_date) AS last_at
      FROM financial_transactions ft
     WHERE ${w2} GROUP BY ft.source ORDER BY ft.source`, p2.list);
  const p3 = new Params();
  const w3 = buildWhere(base, p3);
  const phoneCounts = await pool.query(`
    SELECT source, COUNT(DISTINCT phone)::int AS phones FROM (
      SELECT ft.source, ft.sender_phone AS phone FROM financial_transactions ft WHERE ${w3}
      UNION ALL
      SELECT ft.source, ft.receiver_phone FROM financial_transactions ft WHERE ${w3}) x
     WHERE phone IS NOT NULL GROUP BY source`, p3.list);
  const phonesBy = Object.fromEntries(phoneCounts.rows.map((r) => [r.source, r.phones]));

  const map = (r) => ({
    count: r.count, volume: money(r.volume), received: money(r.received), sent: money(r.sent), transfers: money(r.transfers),
  });
  const seriesOut = series.rows.map((r) => ({ period: r.period, ...map(r) }));
  const sourcesOut = sources.rows.map((r) => ({
    source: r.source, ...map(r), average: money(r.average), largest: money(r.largest), phones: phonesBy[r.source] ?? 0,
    firstAt: r.first_at.toISOString(), lastAt: r.last_at.toISOString(),
  }));
  // The two source queries count every row once, so grand totals are the sum of the sources.
  const totals = sourcesOut.reduce((t, s) => ({
    count: t.count + s.count, volume: t.volume + s.volume, received: t.received + s.received, sent: t.sent + s.sent, transfers: t.transfers + s.transfers,
  }), { count: 0, volume: 0, received: 0, sent: 0, transfers: 0 });
  return { currency, currencies, period: periodName, totals, series: seriesOut, sources: sourcesOut };
}

export async function reportTopCustomers(f, limit = 10) {
  const n = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
  const { currency, currencies } = await reportCurrency(f);
  if (!currency) return { currency: null, currencies: [], topSenders: [], topReceivers: [], activePhones: [] };
  const base = { ...f, currency };
  const top = async (side) => {
    const prm = new Params();
    const where = buildWhere(base, prm);
    const { rows } = await pool.query(`
      SELECT COALESCE(ft.${side}_phone::text, 'n:' || lower(ft.${side}_name)) AS key,
             (array_agg(ft.${side}_name ORDER BY ft.transaction_date DESC) FILTER (WHERE ft.${side}_name IS NOT NULL))[1] AS name,
             max(ft.${side}_phone) AS phone, COUNT(*)::int AS count, SUM(ft.amount) AS total
        FROM financial_transactions ft
       WHERE ${where} AND (ft.${side}_phone IS NOT NULL OR ft.${side}_name IS NOT NULL)
       GROUP BY 1 ORDER BY total DESC, count DESC, key LIMIT ${prm.add(n)}`, prm.list);
    return rows.map((r) => ({ key: r.key, name: r.name, phone: r.phone, count: r.count, total: money(r.total) }));
  };
  const prm = new Params();
  const where = buildWhere(base, prm);
  const active = await pool.query(`
    SELECT x.phone, (array_agg(x.name ORDER BY x.at DESC) FILTER (WHERE x.name IS NOT NULL))[1] AS name,
           COUNT(DISTINCT x.id)::int AS count, SUM(x.amount) AS total
      FROM (SELECT ft.id, ft.sender_phone AS phone, ft.sender_name AS name, ft.amount, ft.transaction_date AS at
              FROM financial_transactions ft WHERE ${where} AND ft.sender_phone IS NOT NULL
            UNION ALL
            SELECT ft.id, ft.receiver_phone, ft.receiver_name, ft.amount, ft.transaction_date
              FROM financial_transactions ft WHERE ${where} AND ft.receiver_phone IS NOT NULL
               AND ft.receiver_phone IS DISTINCT FROM ft.sender_phone) x
     GROUP BY x.phone ORDER BY count DESC, total DESC, phone LIMIT ${prm.add(n)}`, prm.list);
  return {
    currency, currencies,
    topSenders: await top('sender'),
    topReceivers: await top('receiver'),
    activePhones: active.rows.map((r) => ({ phone: r.phone, name: r.name, count: r.count, total: money(r.total) })),
  };
}

export async function meta() {
  const [s, d] = await Promise.all([
    pool.query('SELECT source, currency, COUNT(*)::int AS count FROM financial_transactions GROUP BY 1, 2 ORDER BY 1, 2'),
    pool.query('SELECT min(transaction_date) AS first_at, max(transaction_date) AS last_at, COUNT(*)::int AS total FROM financial_transactions'),
  ]);
  return {
    total: d.rows[0].total,
    firstAt: d.rows[0].first_at?.toISOString() ?? null,
    lastAt: d.rows[0].last_at?.toISOString() ?? null,
    sources: s.rows,
    currencies: [...new Set(s.rows.map((r) => r.currency))],
  };
}

export async function listBatches(limit = 100) {
  const { rows } = await pool.query(
    `SELECT id, source, filename, encoding, delimiter, total_rows, imported_rows, duplicate_rows, invalid_rows, imported_by_name, created_at
       FROM import_batches ORDER BY created_at DESC LIMIT $1`, [limit]);
  return rows.map((r) => ({
    id: r.id, source: r.source, filename: r.filename, encoding: r.encoding, delimiter: r.delimiter,
    total: r.total_rows, imported: r.imported_rows, duplicates: r.duplicate_rows, invalid: r.invalid_rows,
    by: r.imported_by_name, at: r.created_at.toISOString(),
  }));
}
