import { Router } from 'express';
import { requireAdmin, requireAuth } from './auth.js';
import { audit } from './audit.js';
import { pool } from './db.js';
import { computeSummary, currentPeriod } from './period.js';
import { tr } from './lang.js';

export const closings = Router();
closings.use(requireAuth);

const wrap = (fn) => (req, res) =>
  fn(req, res).catch((e) => {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  });

const toApi = (r) => ({
  year: r.year,
  month: r.month,
  closedAt: new Date(r.closed_at).toISOString(),
  closedBy: r.closed_by_name ?? null,
  snapshot: r.snapshot,
});

function parseYM(src) {
  const year = Number(src.year);
  const month = Number(src.month);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  return { year, month };
}

const SELECT = `SELECT pc.*, COALESCE(NULLIF(u.full_name, ''), u.username) AS closed_by_name
                  FROM period_closes pc LEFT JOIN users u ON u.id = pc.closed_by`;

closings.get('/', wrap(async (_req, res) => {
  const { rows } = await pool.query(`${SELECT} ORDER BY pc.year DESC, pc.month DESC`);
  res.json(rows.map(toApi));
}));

// Live figures for a month, plus the closing record if it is already closed.
closings.get('/preview', wrap(async (req, res) => {
  const ym = parseYM(req.query);
  if (!ym) return res.status(400).json({ error: 'bad year/month' });
  const summary = await computeSummary(ym.year, ym.month);
  const { rows } = await pool.query(`${SELECT} WHERE pc.year = $1 AND pc.month = $2`, [ym.year, ym.month]);
  res.json({ ...summary, closing: rows[0] ? toApi(rows[0]) : null });
}));

closings.post('/', requireAdmin, wrap(async (req, res) => {
  const ym = parseYM(req.body ?? {});
  if (!ym) return res.status(400).json({ error: 'bad year/month' });
  const now = await currentPeriod();
  if (ym.year * 12 + ym.month > now.year * 12 + now.month) {
    return res.status(400).json({ error: tr(req, 'Bisha mustaqbalka lama xiri karo', 'A future month cannot be closed') });
  }
  const summary = await computeSummary(ym.year, ym.month);
  const snapshot = { accounts: summary.accounts, totals: summary.totals };
  const { rowCount } = await pool.query(
    `INSERT INTO period_closes (year, month, closed_by, snapshot) VALUES ($1,$2,$3,$4)
     ON CONFLICT DO NOTHING`,
    [ym.year, ym.month, req.userId, JSON.stringify(snapshot)],
  );
  if (!rowCount) return res.status(409).json({ error: tr(req, 'Bishan horey ayaa loo xiray', 'This month is already closed') });
  const { rows } = await pool.query(`${SELECT} WHERE pc.year = $1 AND pc.month = $2`, [ym.year, ym.month]);
  await audit(req, 'month_closed', `${ym.year}-${String(ym.month).padStart(2, '0')}`);
  res.status(201).json(toApi(rows[0]));
}));

closings.delete('/:year/:month', requireAdmin, wrap(async (req, res) => {
  const ym = parseYM(req.params);
  if (!ym) return res.status(400).json({ error: 'bad year/month' });
  await pool.query('DELETE FROM period_closes WHERE year = $1 AND month = $2', [ym.year, ym.month]);
  await audit(req, 'month_reopened', `${ym.year}-${String(ym.month).padStart(2, '0')}`);
  res.status(204).end();
}));
