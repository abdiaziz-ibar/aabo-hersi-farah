import 'dotenv/config';
import pg from 'pg';

if (!process.env.DATABASE_URL) {
  console.error(
    '\nDATABASE_URL is missing.\nCopy backend/.env.example to backend/.env and paste your Neon connection string.\n',
  );
  process.exit(1);
}

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Neon requires TLS
  max: 5,
});

/** Business timezone used to decide which month a transaction belongs to. */
export const TZ = process.env.APP_TIMEZONE || 'Africa/Mogadishu';

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id             BIGSERIAL PRIMARY KEY,
      username       TEXT NOT NULL,
      password_hash  TEXT NOT NULL,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS users_username_idx ON users (lower(username));
    ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'staff';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INT NOT NULL DEFAULT 0;
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
    ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin','staff'));
    -- if nobody is admin yet (upgrade from the first version), the oldest user becomes admin
    UPDATE users SET role = 'admin'
      WHERE id = (SELECT min(id) FROM users)
        AND NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin');

    CREATE TABLE IF NOT EXISTS accounts (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      icon        TEXT NOT NULL DEFAULT 'wallet',
      active      BOOLEAN NOT NULL DEFAULT true,
      sort        INT NOT NULL DEFAULT 0,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS accounts_name_idx ON accounts (lower(name));
    -- first run only: the three starting accounts
    INSERT INTO accounts (id, name, icon, sort)
      SELECT * FROM (VALUES ('saadicuun','Saadicuun','wallet',1), ('xaafada','Xaafada','home',2), ('shakhsi','Shakhsi','person',3)) AS v(id, name, icon, sort)
      WHERE NOT EXISTS (SELECT 1 FROM accounts);

    -- how money was received / paid: EVC, Salaam, Dahabshiil, ... (admin can add more)
    CREATE TABLE IF NOT EXISTS payment_methods (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      kind        TEXT NOT NULL DEFAULT 'account' CHECK (kind IN ('phone','account')),
      active      BOOLEAN NOT NULL DEFAULT true,
      sort        INT NOT NULL DEFAULT 0,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS payment_methods_name_idx ON payment_methods (lower(name));
    INSERT INTO payment_methods (id, name, kind, sort)
      SELECT * FROM (VALUES ('evc','EVC Plus','phone',1), ('salaam','Salaam','account',2), ('dahabshiil','Dahabshiil','account',3)) AS v(id, name, kind, sort)
      WHERE NOT EXISTS (SELECT 1 FROM payment_methods);

    CREATE TABLE IF NOT EXISTS transactions (
      id          BIGSERIAL PRIMARY KEY,
      type        TEXT NOT NULL CHECK (type IN ('income','expense')),
      amount      NUMERIC(14,2) NOT NULL CHECK (amount > 0),
      account_id  TEXT NOT NULL,
      party       TEXT NOT NULL,
      place       TEXT NOT NULL DEFAULT 'Kale',
      date        TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    -- accounts are now rows (not a fixed list): replace the old CHECK with a foreign key
    ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_account_id_check;
    ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_account_fk;
    ALTER TABLE transactions ADD CONSTRAINT transactions_account_fk FOREIGN KEY (account_id) REFERENCES accounts(id);
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS method_id TEXT REFERENCES payment_methods(id);
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS method_number TEXT;
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id) ON DELETE SET NULL;
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS created_by BIGINT REFERENCES users(id) ON DELETE SET NULL;
    UPDATE transactions SET created_by = user_id WHERE created_by IS NULL AND user_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS transactions_date_idx ON transactions (date DESC);

    -- numbers saved per payment method (e.g. several EVC phone numbers, several Salaam accounts)
    CREATE TABLE IF NOT EXISTS payment_method_numbers (
      id          BIGSERIAL PRIMARY KEY,
      method_id   TEXT NOT NULL REFERENCES payment_methods(id) ON DELETE CASCADE,
      number      TEXT NOT NULL,
      label       TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS payment_method_numbers_uq ON payment_method_numbers (method_id, number);
    -- numbers already used on past transactions become saved numbers
    INSERT INTO payment_method_numbers (method_id, number)
      SELECT DISTINCT method_id, method_number FROM transactions
       WHERE method_id IS NOT NULL AND method_number IS NOT NULL
      ON CONFLICT DO NOTHING;

    -- Closed accounting periods (month is 1-12). The snapshot freezes the closing figures.
    CREATE TABLE IF NOT EXISTS period_closes (
      year       INT NOT NULL,
      month      INT NOT NULL CHECK (month BETWEEN 1 AND 12),
      closed_by  BIGINT REFERENCES users(id) ON DELETE SET NULL,
      closed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      snapshot   JSONB NOT NULL,
      PRIMARY KEY (year, month)
    );
  `);
}
