import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from './db.js';
import { tr } from './lang.js';

const SECRET = process.env.JWT_SECRET;
if (!SECRET || SECRET.length < 16) {
  console.error(
    '\nJWT_SECRET is missing or too short (min 16 chars).\nAdd it to backend/.env. Generate one with:\n  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"\n',
  );
  process.exit(1);
}

// A real hash to compare against when the user doesn't exist (keeps timing similar).
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

export const publicUser = (r) => ({
  id: String(r.id),
  username: r.username,
  fullName: r.full_name ?? '',
  role: r.role,
  active: r.active,
  createdAt: r.created_at ? new Date(r.created_at).toISOString() : undefined,
});

export const validPassword = (pw) => typeof pw === 'string' && pw.length >= 8 && pw.length <= 128;
export const hashPassword = (pw) => bcrypt.hash(pw, 10);

const sign = (user, remember = false) =>
  jwt.sign({ sub: String(user.id), tv: user.token_version }, SECRET, { expiresIn: remember ? '30d' : '1d' });

// --- tiny in-memory brute-force limiter: 5 failures / 15 min per ip+username ---
const fails = new Map();
const WINDOW = 15 * 60 * 1000;
const MAX_FAILS = 5;
const keyOf = (req, u) => `${req.ip}|${u.toLowerCase()}`;
function blocked(k) {
  const f = fails.get(k);
  if (!f) return false;
  if (Date.now() - f.first > WINDOW) {
    fails.delete(k);
    return false;
  }
  return f.count >= MAX_FAILS;
}
function noteFail(k) {
  const f = fails.get(k);
  if (!f || Date.now() - f.first > WINDOW) fails.set(k, { count: 1, first: Date.now() });
  else f.count += 1;
}

export async function login(req, res) {
  const username = String(req.body?.username ?? '').trim();
  const password = String(req.body?.password ?? '');
  const remember = Boolean(req.body?.remember);
  if (!username || !password) return res.status(400).json({ error: tr(req, 'Geli username iyo password', 'Enter username and password') });

  const k = keyOf(req, username);
  if (blocked(k)) return res.status(429).json({ error: tr(req, 'Isku day aad u badan. Dib u tijaabi 15 daqiiqo kadib.', 'Too many attempts. Try again in 15 minutes.') });

  const { rows } = await pool.query('SELECT * FROM users WHERE lower(username) = lower($1)', [username]);
  const user = rows[0];
  const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) {
    noteFail(k);
    return res.status(401).json({ error: tr(req, 'Username ama password waa khalad', 'Wrong username or password') });
  }
  if (!user.active) return res.status(403).json({ error: tr(req, 'Xisaabtan waa la xidhay. La xiriir maamulaha.', 'This account is disabled. Contact the administrator.') });
  fails.delete(k);
  res.json({ token: sign(user, remember), user: publicUser(user) });
}

/** Express middleware: requires a valid token for an active user; sets req.user / req.userId. */
export async function requireAuth(req, res, next) {
  const h = req.headers.authorization ?? '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: tr(req, 'Login required', 'Login required') });
  let payload;
  try {
    payload = jwt.verify(token, SECRET);
  } catch {
    return res.status(401).json({ error: tr(req, 'Session-ku wuu dhamaaday', 'Your session has expired') });
  }
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [payload.sub]);
    const u = rows[0];
    // token_version changes on password reset/change → old sessions stop working
    if (!u || !u.active || u.token_version !== payload.tv) {
      return res.status(401).json({ error: tr(req, 'Session-ku wuu dhamaaday', 'Your session has expired') });
    }
    req.user = publicUser(u);
    req.userId = String(u.id);
    next();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role === 'admin') return next();
  res.status(403).json({ error: tr(req, 'Maamulaha (admin) kaliya ayaa samayn kara', 'Only an admin can do this') });
}

/** Self-service password change; returns a fresh token so this session stays signed in. */
export async function changePassword(req, res) {
  const { current, next: nextPw } = req.body ?? {};
  if (!validPassword(nextPw)) return res.status(400).json({ error: tr(req, 'Password-ku waa inuu ahaadaa ugu yaraan 8 xaraf', 'Password must be at least 8 characters') });
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.userId]);
  const u = rows[0];
  if (!u || !(await bcrypt.compare(String(current ?? ''), u.password_hash))) {
    return res.status(400).json({ error: tr(req, 'Password-ka hadda jira waa khalad', 'Current password is incorrect') });
  }
  const { rows: upd } = await pool.query(
    'UPDATE users SET password_hash = $1, token_version = token_version + 1 WHERE id = $2 RETURNING *',
    [await hashPassword(nextPw), u.id],
  );
  res.json({ token: sign(upd[0], true) });
}
