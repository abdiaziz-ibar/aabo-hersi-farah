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
