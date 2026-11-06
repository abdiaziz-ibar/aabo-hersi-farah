// Usage: npm run create-user -- <username> <password> [admin|staff]
// Creates the user, or resets the password (and role, if given) when the username exists.
// The very first user is always an admin.
import bcrypt from 'bcryptjs';
import { initDb, pool } from '../db.js';

const [username, password, roleArg] = process.argv.slice(2);
if (!username || !password) {
  console.error('Usage: npm run create-user -- <username> <password> [admin|staff]');
  process.exit(1);
}
if (password.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}
if (roleArg && !['admin', 'staff'].includes(roleArg)) {
  console.error('Role must be "admin" or "staff".');
  process.exit(1);
}

try {
  await initDb();
  const hash = await bcrypt.hash(password, 10);
  const { rows: existing } = await pool.query('SELECT id FROM users WHERE lower(username) = lower($1)', [username.trim()]);
  if (existing[0]) {
    await pool.query(
      `UPDATE users SET password_hash = $1, token_version = token_version + 1, active = true,
         failed_attempts = 0, locked = false, locked_at = NULL,
         role = COALESCE($3, role) WHERE id = $2`,
      [hash, existing[0].id, roleArg ?? null],
    );
    console.log(`Password updated for "${username}"${roleArg ? ` (role: ${roleArg})` : ''}.`);
  } else {
    const { rows: n } = await pool.query('SELECT count(*)::int AS c FROM users');
    const role = n[0].c === 0 ? 'admin' : roleArg ?? 'staff';
    await pool.query('INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3)', [username.trim(), hash, role]);
    console.log(`User "${username}" created (role: ${role}).`);
  }
} catch (e) {
  console.error('Failed:', e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
