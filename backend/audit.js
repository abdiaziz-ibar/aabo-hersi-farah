import { pool } from './db.js';

/** Best-effort security/audit trail; never breaks the request if logging fails. */
export async function audit(req, action, target = '', detail = '', actor) {
  try {
    const who = actor ?? (req.user ? { id: req.user.id, name: req.user.username } : { id: null, name: '' });
    await pool.query(
      'INSERT INTO audit_log (actor_id, actor_name, action, target, detail, ip) VALUES ($1,$2,$3,$4,$5,$6)',
      [who.id, String(who.name ?? '').slice(0, 60), action, String(target).slice(0, 80), String(detail).slice(0, 200), String(req?.ip ?? '').slice(0, 64)],
    );
  } catch (e) {
    console.error('audit log failed:', e.message);
  }
}
