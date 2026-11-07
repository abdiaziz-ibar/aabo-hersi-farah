import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { changePassword, login, requireAdmin, requireAuth } from './auth.js';
import { accounts } from './accounts.js';
import { audit } from './audit.js';
import { rateLimit } from './ratelimit.js';
import { auditRouter, settingsRouter } from './settings.js';
import { methods } from './methods.js';
import { closings } from './closings.js';
import { initDb, pool } from './db.js';
import { runMigrations } from './migrate.js';
import { financial } from './financial/router.js';
import { touchesClosedMonth } from './period.js';
import { users } from './users.js';
import { langMiddleware, tr } from './lang.js';

const app = express();

// Behind a reverse proxy (Render, Nginx, ...) set TRUST_PROXY=1 so client IPs (rate limits, audit log) are real.
if (process.env.TRUST_PROXY) {
  const v = process.env.TRUST_PROXY;
  app.set('trust proxy', /^\d+$/.test(v) ? Number(v) : v === 'true' ? true : v);
}

// Security headers (also removes X-Powered-By). CSP only allows our own scripts/styles/connections.
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false, // the default adds upgrade-insecure-requests, which breaks plain-http LAN use
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      fontSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
  referrerPolicy: { policy: 'no-referrer' },
}));

// CORS is OFF unless CORS_ORIGIN lists the frontend URL(s) (only needed when the web app is hosted separately).
const origins = process.env.CORS_ORIGIN?.split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors({ origin: origins?.length ? origins : false }));
app.use(express.json({ limit: '200kb' }));
app.use(langMiddleware);

// Throttling: general API traffic, plus a tighter cap on login attempts per IP (password spraying).
app.use('/api', rateLimit({ windowMs: 60_000, max: 300 }));
app.use('/api/auth/login', rateLimit({
  windowMs: 15 * 60_000,
  max: 120, // flood guard only; wrong-password blocking is persistent and handled in loginguard.js
  message: ['Isku day aad u badan goobtan. Dib u tijaabi 15 daqiiqo kadib.', 'Too many login requests from this network. Try again in 15 minutes.'],
}));

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
  if (date.getTime() > Date.now() + 36 * 3600 * 1000 || date.getFullYear() < 2000) return [null, 'date out of range'];
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

// ---------- admin: security settings + audit trail ----------
app.use('/api/settings', settingsRouter);
app.use('/api/audit', auditRouter);

// ---------- payment methods (EVC, Salaam, Dahabshiil, ...) ----------
app.use('/api/methods', methods);

// ---------- accounting periods ----------
app.use('/api/closings', closings);

// ---------- financial transactions: EVC Plus / Salaam Bank CSV imports, search, reports (admin only) ----------
app.use('/api/financial-transactions', financial);

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

app.delete('/api/transactions/:id', requireAdmin, wrap(async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'bad id' });
  const { rows } = await pool.query('SELECT date FROM transactions WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(204).end();
  if (await touchesClosedMonth([rows[0].date])) return res.status(409).json({ error: closedMsg(req) });
  await pool.query('DELETE FROM transactions WHERE id = $1', [req.params.id]);
  await audit(req, 'transaction_deleted', `#${req.params.id}`);
  res.status(204).end();
}));



// Unknown API routes → JSON 404 (never the SPA page).
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// Serve the built web app (frontend/dist) from the same server when it exists.
// This lets the phone app / any browser open http://<this-computer>:4000 directly.
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../frontend/dist');
if (fs.existsSync(path.join(dist, 'index.html'))) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
} else {
  app.get('/', (_req, res) => res.json({ name: 'aabo-api', ok: true, hint: 'Build the frontend (npm run build in frontend/) to serve the web app here.' }));
}

// Last-resort error handler: JSON only, never a stack trace.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large' });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

const port = Number(process.env.PORT) || 4000;
initDb()
  .then(runMigrations)
  .then(() => app.listen(port, () => console.log(`API ready on http://localhost:${port}`)))
  .catch((e) => {
    console.error('Could not connect to the database:', e.message);
    process.exit(1);
  });
