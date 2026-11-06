import { Router } from 'express';
import { hashPassword, publicUser, requireAdmin, requireAuth, validPassword } from './auth.js';
import { pool } from './db.js';
import { tr } from './lang.js';

export const users = Router();
users.use(requireAuth, requireAdmin);

const wrap = (fn) => (req, res) =>
  fn(req, res).catch((e) => {
    if (e?.code === '23505') return res.status(409).json({ error: tr(req, 'Username horey ayuu u jiray', 'Username already exists') });
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  });

const USERNAME_RE = /^[a-zA-Z0-9._-]{3,32}$/;
const idOk = (s) => /^\d+$/.test(s);

users.get('/', wrap(async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM users ORDER BY id');
  res.json(rows.map(publicUser));
}));

users.post('/', wrap(async (req, res) => {
  const username = String(req.body?.username ?? '').trim();
  const fullName = String(req.body?.fullName ?? '').trim().slice(0, 80);
  const role = req.body?.role === 'admin' ? 'admin' : 'staff';
  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({ error: tr(req, 'Username: 3-32 xaraf (xarfaha, tirooyinka, . _ -)', 'Username: 3-32 characters (letters, digits, . _ -)') });
  }
  if (!validPassword(req.body?.password)) return res.status(400).json({ error: tr(req, 'Password-ku waa inuu ahaadaa ugu yaraan 8 xaraf', 'Password must be at least 8 characters') });
  const { rows } = await pool.query(
    'INSERT INTO users (username, full_name, role, password_hash) VALUES ($1,$2,$3,$4) RETURNING *',
    [username, fullName || null, role, await hashPassword(req.body.password)],
  );
  res.status(201).json(publicUser(rows[0]));
}));

users.patch('/:id', wrap(async (req, res) => {
  if (!idOk(req.params.id)) return res.status(400).json({ error: 'bad id' });
  const { rows: cur } = await pool.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
  const u = cur[0];
  if (!u) return res.status(404).json({ error: tr(req, 'User lama helin', 'User not found') });

  const fullName = req.body?.fullName === undefined ? u.full_name : String(req.body.fullName).trim().slice(0, 80) || null;
  const role = req.body?.role === undefined ? u.role : req.body.role === 'admin' ? 'admin' : 'staff';
  const active = req.body?.active === undefined ? u.active : Boolean(req.body.active);

  if (String(u.id) === req.userId && (role !== 'admin' || !active)) {
    return res.status(400).json({ error: tr(req, 'Naftaada ma dhimi kartid ama ma xidhi kartid', 'You cannot demote or disable yourself') });
  }
  const losingAdmin = u.role === 'admin' && u.active && (role !== 'admin' || !active);
  if (losingAdmin) {
    const { rows } = await pool.query(
      "SELECT count(*)::int AS c FROM users WHERE role = 'admin' AND active AND id <> $1", [u.id],
    );
    if (rows[0].c === 0) return res.status(400).json({ error: tr(req, 'Waa inuu hadhaa ugu yaraan hal admin oo shaqeynaya', 'At least one active admin must remain') });
  }
  const { rows } = await pool.query(
    `UPDATE users SET full_name = $1, role = $2, active = $3,
       token_version = token_version + CASE WHEN $3 = false OR $2 <> role THEN 1 ELSE 0 END
     WHERE id = $4 RETURNING *`,
    [fullName, role, active, u.id],
  );
  res.json(publicUser(rows[0]));
}));

users.post('/:id/reset-password', wrap(async (req, res) => {
  if (!idOk(req.params.id)) return res.status(400).json({ error: 'bad id' });
  if (!validPassword(req.body?.password)) return res.status(400).json({ error: tr(req, 'Password-ku waa inuu ahaadaa ugu yaraan 8 xaraf', 'Password must be at least 8 characters') });
  const { rowCount } = await pool.query(
    'UPDATE users SET password_hash = $1, token_version = token_version + 1 WHERE id = $2',
    [await hashPassword(req.body.password), req.params.id],
  );
  if (!rowCount) return res.status(404).json({ error: tr(req, 'User lama helin', 'User not found') });
  res.status(204).end();
}));
