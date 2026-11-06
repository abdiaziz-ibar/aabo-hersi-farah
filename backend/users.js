import { Router } from 'express';
import { hashPassword, passwordProblem, publicUser, requireAdmin, requireAuth } from './auth.js';
import { audit } from './audit.js';
import { clearBlock } from './loginguard.js';
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
  const problem = passwordProblem(req, req.body?.password, username);
  if (problem) return res.status(400).json({ error: problem });
  const { rows } = await pool.query(
    'INSERT INTO users (username, full_name, role, password_hash) VALUES ($1,$2,$3,$4) RETURNING *',
    [username, fullName || null, role, await hashPassword(req.body.password)],
  );
  await clearBlock('name', username); // earlier typos of this name must not block the new user
  await audit(req, 'user_created', username, `role ${role}`);
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
  await audit(req, 'user_updated', u.username, `role ${role}, ${active ? 'active' : 'disabled'}`);
  res.json(publicUser(rows[0]));
}));

// Lift a lock caused by too many wrong passwords.
users.post('/:id/unlock', wrap(async (req, res) => {
  if (!idOk(req.params.id)) return res.status(400).json({ error: 'bad id' });
  const { rows } = await pool.query(
    'UPDATE users SET locked = false, locked_at = NULL, failed_attempts = 0 WHERE id = $1 RETURNING *',
    [req.params.id],
  );
  if (!rows[0]) return res.status(404).json({ error: tr(req, 'User lama helin', 'User not found') });
  await audit(req, 'account_unlocked', rows[0].username);
  res.json(publicUser(rows[0]));
}));

users.post('/:id/reset-password', wrap(async (req, res) => {
  if (!idOk(req.params.id)) return res.status(400).json({ error: 'bad id' });
  const { rows: t } = await pool.query('SELECT username FROM users WHERE id = $1', [req.params.id]);
  if (!t[0]) return res.status(404).json({ error: tr(req, 'User lama helin', 'User not found') });
  const problem = passwordProblem(req, req.body?.password, t[0].username);
  if (problem) return res.status(400).json({ error: problem });
  // a password reset also lifts a lock and clears the wrong-attempt counter
  await pool.query(
    'UPDATE users SET password_hash = $1, token_version = token_version + 1, failed_attempts = 0, locked = false, locked_at = NULL WHERE id = $2',
    [await hashPassword(req.body.password), req.params.id],
  );
  await audit(req, 'password_reset', t[0].username);
  res.status(204).end();
}));
