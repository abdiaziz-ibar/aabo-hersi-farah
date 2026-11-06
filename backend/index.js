import cors from 'cors';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { changePassword, login, requireAdmin, requireAuth } from './auth.js';
import { accounts } from './accounts.js';
import { methods } from './methods.js';
import { closings } from './closings.js';
import { initDb, pool } from './db.js';
import { touchesClosedMonth } from './period.js';
import { users } from './users.js';
import { langMiddleware, tr } from './lang.js';

const app = express();
// CORS_ORIGIN: comma-separated list of allowed frontend URLs (default: allow all)
const origins = process.env.CORS_ORIGIN?.split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors({ origin: origins?.length ? origins : true }));
app.use(express.json({ limit: '1mb' }));
app.use(langMiddleware);

const closedMsg = (req) => tr(req, 'Bisha waa xiran tahay. Maamuluhu waa inuu dib u furaa si wax loo bedelo.', 'This month is closed. An admin must reopen it to make changes.');

const SELECT_TX = `SELECT t.*, COALESCE(NULLIF(u.full_name, ''), u.username) AS created_by_name, m.name AS method_name
                     FROM transactions t
                     LEFT JOIN users u ON u.id = t.created_by
                     LEFT JOIN payment_methods m ON m.id = t.method_id`;

const toApi = (r) => ({
  id: String(r.id),
  type: r.type,
  amount: Number(r.amount),
  accountId: r.account_id,
  party: r.party,
  place: r.place,
  date: r.date.toISOString(),
  createdBy: r.created_by_name ?? null,
  methodId: r.method_id ?? null,
  methodName: r.method_name ?? null,
  methodNumber: r.method_number ?? null,
});

/** Validates one incoming transaction; returns [clean, errorMessage]. */
function clean(b) {
  if (!b || (b.type !== 'income' && b.type !== 'expense')) return [null, 'type must be income or expense'];
  const amount = Number(b.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1e12) return [null, 'amount must be > 0'];
  if (typeof b.accountId !== 'string' || !b.accountId) return [null, 'account is required'];
  const party = String(b.party ?? '').trim().slice(0, 120);
  if (!party) return [null, 'party is required'];
  const place = String(b.place ?? '').trim().slice(0, 80) || 'Kale';
  const date = b.date ? new Date(b.date) : new Date();
  if (Number.isNaN(+date)) return [null, 'invalid date'];
  // optional payment method (EVC, Salaam, ...) + the number/account number used
  const methodId = b.methodId ? String(b.methodId) : null;
  let methodNumber = null;
  if (methodId) {
    methodNumber = String(b.methodNumber ?? '').trim();
    if (methodNumber.length < 3 || methodNumber.length > 40) return [null, 'method number must be 3-40 characters'];
  }
  return [{ type: b.type, amount: Math.round(amount * 100) / 100, accountId: b.accountId, party, place, date, methodId, methodNumber }, null];
}

const badAccount = (req) => tr(req, 'Xisaabtan lama heli karo ama waa la xidhay', 'Account not found or archived');
async function allActive(ids) {
  const { rows } = await pool.query('SELECT id FROM accounts WHERE active AND id = ANY($1::text[])', [[...new Set(ids)]]);
  return rows.length === new Set(ids).size;
}

async function methodsActive(ids) {
  const wanted = [...new Set(ids.filter(Boolean))];
  if (!wanted.length) return true;
  const { rows } = await pool.query('SELECT id FROM payment_methods WHERE active AND id = ANY($1::text[])', [wanted]);
  return rows.length === wanted.length;
}
const badMethod = (req) => tr(req, 'Habka lacag-bixinta lama heli karo ama waa la xidhay', 'Payment method not found or archived');

const wrap = (fn) => (req, res) =>
  fn(req, res).catch((e) => {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  });

app.get('/api/health', wrap(async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true });
}));

// ---------- auth ----------
app.post('/api/auth/login', wrap(login));
app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: req.user }));
app.post('/api/auth/change-password', requireAuth, wrap(changePassword));

// ---------- user management (admin) ----------
app.use('/api/users', users);

// ---------- accounts (admin manages; everyone can list) ----------
app.use('/api/accounts', accounts);

// ---------- payment methods (EVC, Salaam, Dahabshiil, ...) ----------
app.use('/api/methods', methods);

// ---------- accounting periods ----------
app.use('/api/closings', closings);

// ---------- transactions: shared books, any signed-in user can read/add ----------
app.use('/api/transactions', requireAuth);

app.get('/api/transactions', wrap(async (_req, res) => {
  const { rows } = await pool.query(`${SELECT_TX} ORDER BY t.date DESC, t.id DESC`);
  res.json(rows.map(toApi));
}));

app.post('/api/transactions', wrap(async (req, res) => {
  const [t, err] = clean(req.body);
  if (err) return res.status(400).json({ error: err });
  if (!(await allActive([t.accountId]))) return res.status(400).json({ error: badAccount(req) });
  if (!(await methodsActive([t.methodId]))) return res.status(400).json({ error: badMethod(req) });
  if (await touchesClosedMonth([t.date])) return res.status(409).json({ error: closedMsg(req) });
  const { rows } = await pool.query(
    `INSERT INTO transactions (created_by, type, amount, account_id, party, place, date, method_id, method_number)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [req.userId, t.type, t.amount, t.accountId, t.party, t.place, t.date, t.methodId, t.methodNumber],
  );
  // a number typed in the Add dialog is remembered for next time
  if (t.methodId && t.methodNumber) {
    await pool.query(
      'INSERT INTO payment_method_numbers (method_id, number) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [t.methodId, t.methodNumber],
    );
  }
  const { rows: full } = await pool.query(`${SELECT_TX} WHERE t.id = $1`, [rows[0].id]);
  res.status(201).json(toApi(full[0]));
}));

// Bulk insert (demo data) — admin only
app.post('/api/transactions/bulk', requireAdmin, wrap(async (req, res) => {
  const items = Array.isArray(req.body) ? req.body : [];
  if (items.length === 0 || items.length > 500) return res.status(400).json({ error: 'send 1-500 items' });
  const cleaned = [];
  for (const it of items) {
    const [t, err] = clean(it);
    if (err) return res.status(400).json({ error: err });
    cleaned.push(t);
  }
  if (!(await allActive(cleaned.map((t) => t.accountId)))) return res.status(400).json({ error: badAccount(req) });
  if (!(await methodsActive(cleaned.map((t) => t.methodId)))) return res.status(400).json({ error: badMethod(req) });
  if (await touchesClosedMonth(cleaned.map((t) => t.date))) return res.status(409).json({ error: closedMsg(req) });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const t of cleaned) {
      await client.query(
        `INSERT INTO transactions (created_by, type, amount, account_id, party, place, date, method_id, method_number)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [req.userId, t.type, t.amount, t.accountId, t.party, t.place, t.date, t.methodId, t.methodNumber],
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  res.status(201).json({ inserted: cleaned.length });
}));

app.delete('/api/transactions/:id', requireAdmin, wrap(async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'bad id' });
  const { rows } = await pool.query('SELECT date FROM transactions WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(204).end();
  if (await touchesClosedMonth([rows[0].date])) return res.status(409).json({ error: closedMsg(req) });
  await pool.query('DELETE FROM transactions WHERE id = $1', [req.params.id]);
  res.status(204).end();
}));

app.delete('/api/transactions', requireAdmin, wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT 1 FROM period_closes LIMIT 1');
  if (rows.length) return res.status(409).json({ error: tr(req, 'Ma tirtiri kartid: waxaa jira bilo xiran. Marka hore dib u fur.', 'Cannot delete: there are closed months. Reopen them first.') });
  await pool.query('DELETE FROM transactions');
  res.status(204).end();
}));

// Serve the built web app (frontend/dist) from the same server when it exists.
// This lets the phone app / any browser open http://<this-computer>:4000 directly.
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../frontend/dist');
if (fs.existsSync(path.join(dist, 'index.html'))) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
} else {
  app.get('/', (_req, res) => res.json({ name: 'aabo-api', ok: true, hint: 'Build the frontend (npm run build in frontend/) to serve the web app here.' }));
}

const port = Number(process.env.PORT) || 4000;
initDb()
  .then(() => app.listen(port, () => console.log(`API ready on http://localhost:${port}`)))
  .catch((e) => {
    console.error('Could not connect to the database:', e.message);
    process.exit(1);
  });
