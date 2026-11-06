import { Router } from 'express';
import { requireAdmin, requireAuth } from './auth.js';
import { pool } from './db.js';
import { tr } from './lang.js';

export const methods = Router();
methods.use(requireAuth);

const KINDS = ['phone', 'account'];
const toApi = (r, numbers = []) => ({ id: r.id, name: r.name, kind: r.kind, active: r.active, numbers });
const numApi = (r) => ({ id: String(r.id), number: r.number, label: r.label ?? '' });

async function numbersByMethod() {
  const { rows } = await pool.query('SELECT * FROM payment_method_numbers ORDER BY created_at, id');
  const map = new Map();
  for (const r of rows) map.set(r.method_id, [...(map.get(r.method_id) ?? []), numApi(r)]);
  return map;
}

const wrap = (fn) => (req, res) =>
  fn(req, res).catch((e) => {
    if (e?.code === '23505') {
      const dupNumber = String(e.constraint ?? '').includes('numbers');
      return res.status(409).json({
        error: dupNumber
          ? tr(req, 'Lambarkan horey ayuu u jiray habkan', 'That number already exists for this method')
          : tr(req, 'Habka magacaas leh horey ayaa u jirtay', 'A method with that name already exists'),
      });
    }
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  });

const cleanName = (v) => String(v ?? '').trim().replace(/\s+/g, ' ');
const nameOk = (n) => n.length >= 2 && n.length <= 40;
const nameErr = (req) => tr(req, 'Magaca habka waa inuu ahaadaa 2-40 xaraf', 'Method name must be 2-40 characters');
const slug = (name) =>
  name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);

methods.get('/', wrap(async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM payment_methods ORDER BY sort, created_at');
  const nums = await numbersByMethod();
  res.json(rows.map((r) => toApi(r, nums.get(r.id) ?? [])));
}));

methods.post('/', requireAdmin, wrap(async (req, res) => {
  const name = cleanName(req.body?.name);
  const kind = KINDS.includes(req.body?.kind) ? req.body.kind : 'account';
  if (!nameOk(name)) return res.status(400).json({ error: nameErr(req) });
  const id = `${slug(name) || 'habka'}-${Math.random().toString(36).slice(2, 6)}`;
  const { rows } = await pool.query(
    `INSERT INTO payment_methods (id, name, kind, sort)
     VALUES ($1, $2, $3, COALESCE((SELECT max(sort) FROM payment_methods), 0) + 1) RETURNING *`,
    [id, name, kind],
  );
  res.status(201).json(toApi(rows[0]));
}));

methods.patch('/:id', requireAdmin, wrap(async (req, res) => {
  const { rows: cur } = await pool.query('SELECT * FROM payment_methods WHERE id = $1', [req.params.id]);
  const m = cur[0];
  if (!m) return res.status(404).json({ error: tr(req, 'Habka lama helin', 'Method not found') });
  const name = req.body?.name === undefined ? m.name : cleanName(req.body.name);
  const kind = req.body?.kind === undefined ? m.kind : KINDS.includes(req.body.kind) ? req.body.kind : m.kind;
  const active = req.body?.active === undefined ? m.active : Boolean(req.body.active);
  if (!nameOk(name)) return res.status(400).json({ error: nameErr(req) });
  const { rows } = await pool.query(
    'UPDATE payment_methods SET name = $1, kind = $2, active = $3 WHERE id = $4 RETURNING *',
    [name, kind, active, m.id],
  );
  res.json(toApi(rows[0]));
}));

methods.delete('/:id', requireAdmin, wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT 1 FROM transactions WHERE method_id = $1 LIMIT 1', [req.params.id]);
  if (rows.length) {
    return res.status(409).json({
      error: tr(req, 'Habkan waxaa loo isticmaalay dhaqdhaqaaq, lama tirtiri karo. Ku xidh (archive) beddelkeeda.',
        'This method is used by transactions and cannot be deleted. Archive it instead.'),
    });
  }
  await pool.query('DELETE FROM payment_methods WHERE id = $1', [req.params.id]);
  res.status(204).end();
}));

// ---- saved numbers (phone numbers for EVC-type methods, account numbers for bank-type) ----
export const NUMBER_RE = /^[\w +\-./]{3,40}$/;
const badNumber = (req) => tr(req, 'Lambarka waa inuu ahaadaa 3-40 xaraf', 'The number must be 3-40 characters');

methods.post('/:id/numbers', requireAdmin, wrap(async (req, res) => {
  const number = String(req.body?.number ?? '').trim();
  const label = String(req.body?.label ?? '').trim().slice(0, 40);
  if (!NUMBER_RE.test(number)) return res.status(400).json({ error: badNumber(req) });
  const { rows: m } = await pool.query('SELECT 1 FROM payment_methods WHERE id = $1', [req.params.id]);
  if (!m.length) return res.status(404).json({ error: tr(req, 'Habka lama helin', 'Method not found') });
  const { rows } = await pool.query(
    'INSERT INTO payment_method_numbers (method_id, number, label) VALUES ($1, $2, $3) RETURNING *',
    [req.params.id, number, label || null],
  );
  res.status(201).json(numApi(rows[0]));
}));

methods.patch('/:id/numbers/:nid', requireAdmin, wrap(async (req, res) => {
  if (!/^\d+$/.test(req.params.nid)) return res.status(400).json({ error: 'bad id' });
  const label = String(req.body?.label ?? '').trim().slice(0, 40);
  const { rows } = await pool.query(
    'UPDATE payment_method_numbers SET label = $1 WHERE id = $2 AND method_id = $3 RETURNING *',
    [label || null, req.params.nid, req.params.id],
  );
  if (!rows[0]) return res.status(404).json({ error: tr(req, 'Lambarka lama helin', 'Number not found') });
  res.json(numApi(rows[0]));
}));

// Past transactions keep the number as text, so removing a saved number is always safe.
methods.delete('/:id/numbers/:nid', requireAdmin, wrap(async (req, res) => {
  if (!/^\d+$/.test(req.params.nid)) return res.status(400).json({ error: 'bad id' });
  await pool.query('DELETE FROM payment_method_numbers WHERE id = $1 AND method_id = $2', [req.params.nid, req.params.id]);
  res.status(204).end();
}));
