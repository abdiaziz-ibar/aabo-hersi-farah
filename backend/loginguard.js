import { pool } from './db.js';

// A network (IP) is blocked after too many wrong logins across ANY usernames; the block expires on its own
// (so a shared Wi-Fi or an admin typing wrong is never locked out forever). Names that are not users are
// blocked like locked accounts, until an admin unblocks them.
const IP_MAX = Number(process.env.LOGIN_IP_MAX) || 10;
const IP_WINDOW_MIN = Number(process.env.LOGIN_IP_WINDOW_MIN) || 15;
export const ipWindowMinutes = IP_WINDOW_MIN;

const nameKey = (username) => String(username).toLowerCase().slice(0, 64);

/** True if this IP is currently blocked (expired blocks are cleared). */
export async function ipBlocked(ip) {
  const { rows } = await pool.query("SELECT * FROM login_blocks WHERE kind = 'ip' AND key = $1", [String(ip)]);
  const r = rows[0];
  if (!r || !r.blocked) return false;
  if (Date.now() - new Date(r.blocked_at).getTime() > IP_WINDOW_MIN * 60_000) {
    await pool.query("DELETE FROM login_blocks WHERE kind = 'ip' AND key = $1", [String(ip)]);
    return false;
  }
  return true;
}

/** Count a wrong login from this IP. Returns true if this attempt just blocked it. */
export async function noteIpFailure(ip) {
  const key = String(ip);
  const { rows } = await pool.query("SELECT * FROM login_blocks WHERE kind = 'ip' AND key = $1", [key]);
  const r = rows[0];
  const stale = r && Date.now() - new Date(r.last_at).getTime() > IP_WINDOW_MIN * 60_000;
  const failed = !r || stale ? 1 : r.failed + 1;
  const block = failed > IP_MAX;
  await pool.query(
    `INSERT INTO login_blocks (kind, key, failed, blocked, first_at, last_at, blocked_at)
     VALUES ('ip', $1, $2, $3, now(), now(), CASE WHEN $3 THEN now() END)
     ON CONFLICT (kind, key) DO UPDATE SET failed = $2, blocked = $3, last_at = now(),
       first_at = CASE WHEN $4 THEN now() ELSE login_blocks.first_at END,
       blocked_at = CASE WHEN $3 THEN now() ELSE NULL END`,
    [key, failed, block, !r || stale],
  );
  return block && !(r && r.blocked);
}

export async function nameBlocked(username) {
  const { rows } = await pool.query("SELECT blocked FROM login_blocks WHERE kind = 'name' AND key = $1", [nameKey(username)]);
  return Boolean(rows[0]?.blocked);
}

/** Count a wrong login for a name that is not a user. Returns true if this attempt just blocked it. */
export async function noteNameFailure(username, maxAllowed) {
  const { rows } = await pool.query(
    `INSERT INTO login_blocks (kind, key, failed, blocked, blocked_at)
     VALUES ('name', $1, 1, 1 > $2, CASE WHEN 1 > $2 THEN now() END)
     ON CONFLICT (kind, key) DO UPDATE SET failed = login_blocks.failed + 1, last_at = now(),
       blocked = (login_blocks.failed + 1 > $2),
       blocked_at = CASE WHEN login_blocks.failed + 1 > $2 AND NOT login_blocks.blocked THEN now() ELSE login_blocks.blocked_at END
     RETURNING blocked, failed`,
    [nameKey(username), maxAllowed],
  );
  return rows[0].blocked;
}

export async function clearBlock(kind, key) {
  await pool.query('DELETE FROM login_blocks WHERE kind = $1 AND key = $2', [kind, kind === 'name' ? nameKey(key) : String(key)]);
}

/** Everything an admin can unblock right now. */
export async function listBlocks() {
  await pool.query(
    "DELETE FROM login_blocks WHERE kind = 'ip' AND blocked AND blocked_at < now() - ($1 * interval '1 minute')",
    [IP_WINDOW_MIN],
  );
  const { rows } = await pool.query('SELECT * FROM login_blocks WHERE blocked ORDER BY blocked_at DESC');
  return rows.map((r) => ({
    kind: r.kind,
    key: r.key,
    failed: r.failed,
    blockedAt: new Date(r.blocked_at).toISOString(),
    expiresInMinutes: r.kind === 'ip' ? IP_WINDOW_MIN : null,
  }));
}
