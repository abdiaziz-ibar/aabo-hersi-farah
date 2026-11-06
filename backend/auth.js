import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { audit } from './audit.js';
import { pool } from './db.js';
import { tr } from './lang.js';
import { ipBlocked, ipWindowMinutes, nameBlocked, noteIpFailure, noteNameFailure } from './loginguard.js';
import { getMaxFailedAttempts } from './settings.js';

const SECRET = process.env.JWT_SECRET;
if (!SECRET || SECRET.length < 32 || /change-?me|example|secret-here/i.test(SECRET)) {
  console.error(
    '\nJWT_SECRET is missing, too short (min 32 chars) or still the example value.\nSet a long random one in backend/.env. Generate with:\n  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"\n',
  );
  process.exit(1);
}

const BCRYPT_COST = 10; // must match the cost of stored hashes so unknown-user logins take the same time
// A real hash to compare against when the user doesn't exist (keeps timing similar).
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_COST);

export const publicUser = (r) => ({
  id: String(r.id),
  username: r.username,
  fullName: r.full_name ?? '',
  role: r.role,
  active: r.active,
  locked: Boolean(r.locked),
  failedAttempts: r.failed_attempts ?? 0,
  createdAt: r.created_at ? new Date(r.created_at).toISOString() : undefined,
});

const COMMON = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', '1234567890', 'qwertyui', 'qwerty123', 'iloveyou',
  'admin123', 'welcome1', 'letmein123', 'abc12345', 'abcd1234', '11111111', '00000000', 'passw0rd', 'somalia123',
  'mogadishu', 'hersifarah', 'farah1234', 'hersi1234',
]);

/** Returns a problem message for an unacceptable password, or null if fine. */
export function passwordProblem(req, pw, username = '') {
  if (typeof pw !== 'string' || pw.length < 8 || pw.length > 128) {
    return tr(req, 'Password-ku waa inuu ahaadaa ugu yaraan 8 xaraf', 'Password must be at least 8 characters');
  }
  const low = pw.toLowerCase();
  if (COMMON.has(low) || (username && low === String(username).toLowerCase()) || /^(.)\1+$/.test(pw)) {
    return tr(req, 'Password-kan aad buu u sahlan yahay. Dooro mid kale oo adag.', 'That password is too easy to guess. Choose a stronger one.');
  }
  return null;
}
export const hashPassword = (pw) => bcrypt.hash(pw, BCRYPT_COST);

const sign = (user, remember = false) =>
  jwt.sign({ sub: String(user.id), tv: user.token_version }, SECRET, { expiresIn: remember ? '30d' : '1d' });

// (Per-account brute force is handled by the persistent lockout below; per-IP throttling lives in index.js.)

const lockedMsg = (req) =>
  tr(req, 'Xisaabtan waa la xidhay sababtoo ah isku-day khaldan oo badan. La xiriir maamulaha si lagu furo.',
    'This account is locked after too many wrong attempts. Contact an administrator to unlock it.');

const ipBlockedMsg = (req) =>
  tr(req, `Shabakadan (IP) waa la xannibay ${ipWindowMinutes} daqiiqo sababtoo ah isku-day khaldan oo badan.`,
    `This network is blocked for ${ipWindowMinutes} minutes after too many wrong login attempts.`);

export async function login(req, res) {
  const username = String(req.body?.username ?? '').trim();
  const password = String(req.body?.password ?? '');
  const remember = Boolean(req.body?.remember);
  if (!username || !password) return res.status(400).json({ error: tr(req, 'Geli username iyo password', 'Enter username and password') });
  if (username.length > 64 || password.length > 128) {
    return res.status(401).json({ error: tr(req, 'Username ama password waa khalad', 'Wrong username or password') });
  }

  if (await ipBlocked(req.ip)) {
    await bcrypt.compare(password, DUMMY_HASH);
    return res.status(423).json({ error: ipBlockedMsg(req), code: 'ip_blocked' });
  }

  const { rows } = await pool.query('SELECT * FROM users WHERE lower(username) = lower($1)', [username]);
  const user = rows[0];

  // A name that is not a user gets blocked after too many wrong tries, exactly like a real account would —
  // so outsiders are stopped too, and the response never reveals whether the name exists.
  if (!user && (await nameBlocked(username))) {
    await bcrypt.compare(password, DUMMY_HASH);
    await audit(req, 'login_blocked_unknown', username.slice(0, 60), '', { id: null, name: '' });
    return res.status(423).json({ error: lockedMsg(req), code: 'locked' });
  }

  // A locked account stays locked until an admin unlocks it — even the right password is refused.
  if (user?.locked) {
    await bcrypt.compare(password, DUMMY_HASH); // keep timing similar
    await audit(req, 'login_blocked_locked', user.username, '', { id: user.id, name: user.username });
    return res.status(423).json({ error: lockedMsg(req), code: 'locked' });
  }

  const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) {
    const ipJustBlocked = await noteIpFailure(req.ip);
    if (ipJustBlocked) await audit(req, 'ip_blocked', String(req.ip), `after too many wrong attempts`, { id: null, name: '' });
    const max = await getMaxFailedAttempts();
    if (user) {
      const { rows: upd } = await pool.query(
        `UPDATE users SET failed_attempts = failed_attempts + 1,
           locked = (failed_attempts + 1 > $2),
           locked_at = CASE WHEN failed_attempts + 1 > $2 THEN now() ELSE locked_at END,
           token_version = token_version + CASE WHEN failed_attempts + 1 > $2 THEN 1 ELSE 0 END
         WHERE id = $1 RETURNING locked, failed_attempts`,
        [user.id, max],
      );
      const who = { id: user.id, name: user.username };
      await audit(req, 'login_failed', user.username, `attempt ${upd[0].failed_attempts}`, who);
      if (upd[0].locked) {
        await audit(req, 'account_locked', user.username, `after ${upd[0].failed_attempts} wrong attempts`, who);
        return res.status(423).json({ error: lockedMsg(req), code: 'locked' });
      }
    } else {
      const nowBlocked = await noteNameFailure(username, max);
      await audit(req, nowBlocked ? 'name_blocked' : 'login_failed_unknown', username.slice(0, 60), '', { id: null, name: '' });
      if (nowBlocked) return res.status(423).json({ error: lockedMsg(req), code: 'locked' });
    }
    if (ipJustBlocked) return res.status(423).json({ error: ipBlockedMsg(req), code: 'ip_blocked' });
    return res.status(401).json({ error: tr(req, 'Username ama password waa khalad', 'Wrong username or password') });
  }
  if (!user.active) return res.status(403).json({ error: tr(req, 'Xisaabtan waa la xidhay. La xiriir maamulaha.', 'This account is disabled. Contact the administrator.') });
  if (user.failed_attempts > 0) await pool.query('UPDATE users SET failed_attempts = 0 WHERE id = $1', [user.id]);
  await audit(req, 'login_success', user.username, '', { id: user.id, name: user.username });
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
    if (!u || !u.active || u.locked || u.token_version !== payload.tv) {
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
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.userId]);
  const u = rows[0];
  const problem = passwordProblem(req, nextPw, u?.username);
  if (problem) return res.status(400).json({ error: problem });
  if (!u || !(await bcrypt.compare(String(current ?? ''), u.password_hash))) {
    return res.status(400).json({ error: tr(req, 'Password-ka hadda jira waa khalad', 'Current password is incorrect') });
  }
  const { rows: upd } = await pool.query(
    'UPDATE users SET password_hash = $1, token_version = token_version + 1, failed_attempts = 0 WHERE id = $2 RETURNING *',
    [await hashPassword(nextPw), u.id],
  );
  await audit(req, 'password_changed', u.username);
  res.json({ token: sign(upd[0], true) });
}
