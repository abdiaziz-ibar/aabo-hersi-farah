# Aabo backend (Node.js + Express + Neon Postgres)

```bash
cp .env.example .env   # set DATABASE_URL (Neon) and JWT_SECRET
npm install
npm start              # http://localhost:4000
```

Tables are created/upgraded automatically on start.

## First admin / resetting a password from the terminal

```bash
npm run create-user -- <username> <password> [admin|staff]
```

The very first user is always an admin. After that, admins manage users
from the web app (Isticmaalayaasha page).

## Roles

- **admin** — everything: users, delete, close/reopen months, demo data
- **staff** — view, add transactions, view month closings

## Settings (`.env`)

- `APP_TIMEZONE` — decides which month a transaction belongs to (default `Africa/Mogadishu`)
- `CORS_ORIGIN` — allowed frontend URL(s), comma-separated

## Main endpoints

`/api/auth/login|me|change-password`, `/api/users`, `/api/transactions`,
`/api/closings` (+ `/preview`).

## Security

- **Account lockout:** a user who enters a wrong password more than N times in a row is locked (N is set by an admin in
  *Settings → Security*, default 3, so the 4th wrong attempt locks). An admin unlocks the user on the *Users* page, or by
  resetting their password. If every admin is locked out: `npm run create-user -- <admin> <new-password>` (also unlocks).
- `JWT_SECRET` must be ≥ 32 random characters, otherwise the server will not start.
- CORS is off unless `CORS_ORIGIN` is set; set `TRUST_PROXY=1` behind a reverse proxy; use HTTPS in production.
- All security events are in the admin *Security log*. See `SECURITY-REPORT.md` at the repo root.

- **Outsiders are blocked too:** a username that is *not* a user is blocked after the same number of wrong tries (with the
  same response as a locked real account, so nothing reveals which names exist). A network (IP) is blocked for 15 minutes after
  more than 10 wrong logins across any usernames (`LOGIN_IP_MAX`, `LOGIN_IP_WINDOW_MIN`). Admins see and lift both on the
  *Users* page (**Blocked attempts**). Creating a user also clears any earlier block on that name.
