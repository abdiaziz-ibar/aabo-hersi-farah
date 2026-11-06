# Aabo

- `src/`, `app/` — Expo (React Native) mobile app
- `web/` — React (Vite) web app
- `server/` — Node.js (Express) API using a Neon Postgres database

## Run the web version

1. Create a Neon project and copy its connection string.
2. `cd server && cp .env.example .env`, then paste the string into `DATABASE_URL`.
3. Start the API (it creates the table automatically): `cd server && npm start`
4. In another terminal: `cd web && npm run dev` → http://localhost:5173

## Production (one server)

`cd web && npm run build`, then `cd server && npm start`. The API also serves `web/dist`.
