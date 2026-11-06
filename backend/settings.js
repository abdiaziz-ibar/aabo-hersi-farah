import { Router } from 'express';
import { requireAdmin, requireAuth } from './auth.js';
import { audit } from './audit.js';
import { pool } from './db.js';
import { clearBlock, listBlocks } from './loginguard.js';
import { tr } from './lang.js';

export const DEFAULT_MAX_FAILED = 3;

/** Wrong passwords tolerated before an account is locked (the next wrong one locks it). */
export async function getMaxFailedAttempts() {
  const { rows } = await pool.query("SELECT value FROM settings WHERE key = 'max_failed_attempts'");
  const n = Number(rows[0]?.value);
  return Number.isInteger(n) && n >= 1 && n <= 10 ? n : DEFAULT_MAX_FAILED;
}

export const settingsRouter = Router();
settingsRouter.use(requireAuth, requireAdmin);

settingsRouter.get('/security', async (_req, res) => {
  try {
    res.json({ maxFailedAttempts: await getMaxFailedAttempts() });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

settingsRouter.put('/security', async (req, res) => {
  try {
    const n = Number(req.body?.maxFailedAttempts);
    if (!Number.isInteger(n) || n < 1 || n > 10) {
      return res.status(400).json({ error: tr(req, 'Tirada waa inuu ahaadaa 1 ilaa 10', 'The number must be between 1 and 10') });
    }
    await pool.query(
      "INSERT INTO settings (key, value) VALUES ('max_failed_attempts', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
      [String(n)],
    );
    await audit(req, 'settings_changed', 'max_failed_attempts', String(n));
    res.json({ maxFailedAttempts: n });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

settingsRouter.get('/blocks', async (_req, res) => {
  try {
    res.json(await listBlocks());
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

settingsRouter.post('/blocks/unblock', async (req, res) => {
  try {
    const { kind, key } = req.body ?? {};
    if (!['name', 'ip'].includes(kind) || typeof key !== 'string' || !key) return res.status(400).json({ error: 'bad request' });
    await clearBlock(kind, key);
    await audit(req, 'unblocked', `${kind}:${key}`.slice(0, 80));
    res.status(204).end();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

export const auditRouter = Router();
auditRouter.use(requireAuth, requireAdmin);

auditRouter.get('/', async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const { rows } = await pool.query('SELECT * FROM audit_log ORDER BY at DESC, id DESC LIMIT $1', [limit]);
    res.json(rows.map((r) => ({
      id: String(r.id), at: new Date(r.at).toISOString(), actor: r.actor_name, action: r.action,
      target: r.target, detail: r.detail, ip: r.ip,
    })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});
