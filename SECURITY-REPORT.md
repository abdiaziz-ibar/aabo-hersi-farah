# Security assessment — Hersi Farah system

Scope: `backend/` (Node/Express API + Neon Postgres), `frontend/` (React web app), `android-app/` (WebView wrapper).
Method: manual code review + live black-box attacks against a running copy of the API
(auth bypass, JWT forgery, privilege escalation, SQL injection, mass assignment, error leakage, headers, CORS,
brute force, path traversal, input validation). Findings below were **found, fixed and re-tested**.

## Findings (fixed)

| # | Severity | Finding | Fix |
|---|----------|---------|-----|
| 1 | **High** | Unlimited password guessing on one account (only a per-IP+username in-memory throttle that resets on restart) | Persistent **account lockout** after N wrong passwords (default 3 allowed, the 4th locks). Locked even for the right password until an admin unlocks it. Sessions of a locked user are revoked. |
| 2 | **High** | `ssl: { rejectUnauthorized: false }` — database connection did not verify Neon's certificate (man-in-the-middle possible) | Certificate verification is now on. `DB_SSL_INSECURE=true` exists only for self-signed databases. |
| 3 | **High** | `.env.example` contained a *valid-looking* JWT secret (`change-me-…`). Anyone who copied it unchanged would run with a publicly known secret → anyone could forge admin tokens | Server refuses to start unless `JWT_SECRET` is ≥ 32 chars and not an example value. |
| 4 | Medium | No per-IP throttling across usernames (password spraying) and no general API rate limit | 30 login attempts / 15 min / IP; 300 requests / min / IP. Memory-bounded. |
| 5 | Medium | Malformed or oversized JSON returned an HTML page **with a stack trace** (file paths, library names) | JSON-only error handler; body limit lowered to 200 kB. |
| 6 | Medium | Missing security headers (CSP, X-Frame-Options, nosniff, Referrer-Policy); `X-Powered-By: Express` | `helmet` with a strict CSP (own scripts/styles/connections only, no framing). |
| 7 | Medium | CORS reflected **any** origin | CORS is off unless `CORS_ORIGIN` lists the frontend URL(s). |
| 8 | Medium | CSV export formula injection: a party/place such as `=HYPERLINK(...)` would run in Excel/Sheets | Cells starting with `= + - @` are neutralised in the export. |
| 9 | Medium | Transactions could be dated 2099 or 1970 (corrupts reports and month closing) | Server rejects dates > 36 h in the future or before 2000. |
| 10 | Low | Weak passwords accepted (`password123`, same as username) | Common-password and username-equals-password checks (min length still 8). |
| 11 | Low | Unknown paths under `/api` fell through to the web page | JSON 404. |
| 12 | Low | No audit trail | `audit_log` table + admin "Security log" (logins, failures, locks, unlocks, resets, deletes, month close/reopen). |
| 13 | Low | Android WebView could navigate away from the server | Only the configured server stays in the app; other links open in the phone browser; mixed content and file access disabled. |

## Tested and found OK

- Every `/api` data route returns 401 without a token; JWT `alg=none`, bad signatures and guessed secrets are rejected.
- Staff cannot reach any admin endpoint (users, accounts, methods, closings, delete, settings, audit).
- SQL injection payloads in login, ids and fields: all queries are parameterised; tables intact afterwards.
- Mass assignment (`id`, `createdBy`) ignored. Unknown-user vs wrong-password responses and timing are the same.
- Static-file path traversal does not expose `.env`. No secrets are tracked in git. No `dangerouslySetInnerHTML`/`eval` in the web app.
- Passwords are bcrypt-hashed; password reset/change/disable/role change revokes existing sessions (`token_version`).

## Remaining risks / recommendations

1. **Use HTTPS.** The LAN/APK setup uses plain `http://`, so passwords and tokens cross the Wi-Fi in clear text. Fine at home, not on public Wi-Fi. When you deploy, put the app behind HTTPS (Vercel/Render/Cloudflare) and set `TRUST_PROXY=1`.
2. **The login token lives in browser storage** (needed for the "remember me" feature). An XSS bug would expose it. The strict CSP and React's escaping reduce this; keep dependencies updated (`npm audit`).
3. **Lockout can be abused to lock someone out** (anyone who knows a username can lock it). That is the trade-off of "lock until an admin unlocks". If **all admins** get locked, recover from the terminal: `npm run create-user -- <admin> <new-password>` (also unlocks).
4. **`node_modules/` is tracked in the git repository** (committed by the first commit before `.gitignore` existed). No secrets are in it, but it bloats the repo. Fix: `git rm -r --cached node_modules && git commit -m "Stop tracking node_modules"`.
5. Rate limits are in memory (reset on restart, per server instance). Behind several instances use a shared store (Redis).
6. No two-factor authentication. Consider it for admin accounts.
7. Logging out only deletes the token in the browser; the token stays valid until it expires (1 day, or 30 days with "remember me"). Changing the password or disabling the user revokes it immediately.
8. Back up the Neon database (Neon has point-in-time restore on paid plans) — month closing and deletes are not reversible from the app.
