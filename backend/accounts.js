import { Router } from 'express';
import { requireAdmin, requireAuth } from './auth.js';
import { pool } from './db.js';
import { tr } from './lang.js';

export const accounts = Router();
accounts.use(requireAuth);

const ICONS = ['wallet', 'home', 'person', 'briefcase', 'landmark', 'piggy-bank'];

const toApi = (r) => ({ id: r.id, name: r.name, icon: r.icon, active: r.active });

const wrap = (fn) => (req, res) =>
  fn(req, res).catch((e) => {
    if (e?.code === '23505') return res.status(409).json({ error: tr(req, 'Xisaab magacaas leh horey ayaa u jirtay', 'An account with that name already exists') });
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  });

const cleanName = (v) => String(v ?? '').trim().replace(/\s+/g, ' ');
const nameOk = (n) => n.length >= 2 && n.length <= 40;

const slug = (name) =>
  name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);

async function balanceOf(id) {
  const { rows } = await pool.query(
    "SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0) AS b FROM transactions WHERE account_id = $1",
    [id],
  );
  return Number(rows[0].b);
}

accounts.get('/', wrap(async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM accounts ORDER BY sort, created_at');
  res.json(rows.map(toApi));
}));

accounts.post('/', requireAdmin, wrap(async (req, res) => {
  const name = cleanName(req.body?.name);
  const icon = ICONS.includes(req.body?.icon) ? req.body.icon : 'wallet';
  if (!nameOk(name)) return res.status(400).json({ error: tr(req, 'Magaca xisaabta waa inuu ahaadaa 2-40 xaraf', 'Account name must be 2-40 characters') });
  const base = slug(name) || 'xisaab';
  const id = `${base}-${Math.random().toString(36).slice(2, 6)}`;
  const { rows } = await pool.query(
    `INSERT INTO accounts (id, name, icon, sort)
     VALUES ($1, $2, $3, COALESCE((SELECT max(sort) FROM accounts), 0) + 1) RETURNING *`,
    [id, name, icon],
  );
  res.status(201).json(toApi(rows[0]));
}));

accounts.patch('/:id', requireAdmin, wrap(async (req, res) => {
  const { rows: cur } = await pool.query('SELECT * FROM accounts WHERE id = $1', [req.params.id]);
  const a = cur[0];
  if (!a) return res.status(404).json({ error: tr(req, 'Xisaabta lama helin', 'Account not found') });

  const name = req.body?.name === undefined ? a.name : cleanName(req.body.name);
  const icon = req.body?.icon === undefined ? a.icon : ICONS.includes(req.body.icon) ? req.body.icon : a.icon;
  const active = req.body?.active === undefined ? a.active : Boolean(req.body.active);
  if (!nameOk(name)) return res.status(400).json({ error: tr(req, 'Magaca xisaabta waa inuu ahaadaa 2-40 xaraf', 'Account name must be 2-40 characters') });

  if (a.active && !active) {
    if ((await balanceOf(a.id)) !== 0) {
      return res.status(409).json({ error: tr(req, 'Xisaab hadhaag leh lama xidhi karo. Marka hore hadhaagga ka dhig eber.', 'An account with a balance cannot be archived. Bring the balance to zero first.') });
    }
    const { rows } = await pool.query('SELECT count(*)::int AS c FROM accounts WHERE active AND id <> $1', [a.id]);
    if (rows[0].c === 0) return res.status(400).json({ error: tr(req, 'Waa inuu hadhaa ugu yaraan hal xisaab oo shaqeynaysa', 'At least one active account must remain') });
  }
  const { rows } = await pool.query(
    'UPDATE accounts SET name = $1, icon = $2, active = $3 WHERE id = $4 RETURNING *',
    [name, icon, active, a.id],
  );
  res.json(toApi(rows[0]));
}));

accounts.delete('/:id', requireAdmin, wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT 1 FROM transactions WHERE account_id = $1 LIMIT 1', [req.params.id]);
  if (rows.length) {
    return res.status(409).json({ error: tr(req, 'Xisaabtan waxay leedahay dhaqdhaqaaq, lama tirtiri karo. Ku xidh (archive) beddelkeeda.', 'This account has transactions and cannot be deleted. Archive it instead.') });
  }
  const { rows: act } = await pool.query('SELECT count(*)::int AS c FROM accounts WHERE active AND id <> $1', [req.params.id]);
  if (act[0].c === 0) return res.status(400).json({ error: tr(req, 'Waa inuu hadhaa ugu yaraan hal xisaab oo shaqeynaysa', 'At least one active account must remain') });
  await pool.query('DELETE FROM accounts WHERE id = $1', [req.params.id]);
  res.status(204).end();
}));
