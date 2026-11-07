-- Financial Transaction Management module (EVC Plus + Salaam Bank CSV imports).
-- Additive only: creates new tables/indexes, never touches existing ones.

CREATE TABLE IF NOT EXISTS import_batches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source          TEXT NOT NULL CHECK (source IN ('EVC_PLUS', 'SALAAM_BANK')),
  filename        TEXT NOT NULL,
  file_sha256     TEXT NOT NULL,
  file_size       INT  NOT NULL DEFAULT 0,
  encoding        TEXT,
  delimiter       TEXT,
  total_rows      INT  NOT NULL DEFAULT 0,
  imported_rows   INT  NOT NULL DEFAULT 0,
  duplicate_rows  INT  NOT NULL DEFAULT 0,
  invalid_rows    INT  NOT NULL DEFAULT 0,
  mapping         JSONB,
  options         JSONB,
  error_sample    JSONB,                       -- first invalid rows + reasons, for troubleshooting
  imported_by     BIGINT REFERENCES users(id) ON DELETE SET NULL,
  imported_by_name TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS import_batches_created_idx ON import_batches (created_at DESC);

CREATE TABLE IF NOT EXISTS financial_transactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source            TEXT NOT NULL CHECK (source IN ('EVC_PLUS', 'SALAAM_BANK')),
  transaction_id    TEXT,
  dedupe_key        TEXT NOT NULL,             -- source-specific identity used to block duplicate imports
  transaction_date  TIMESTAMPTZ NOT NULL,
  sender_name       TEXT,
  sender_phone      TEXT,                      -- digits only (normalised)
  receiver_name     TEXT,
  receiver_phone    TEXT,
  amount            NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  currency          TEXT NOT NULL DEFAULT 'USD',
  transaction_type  TEXT NOT NULL CHECK (transaction_type IN ('SENT', 'RECEIVED', 'TRANSFER')),
  description       TEXT,
  reference_number  TEXT,
  import_batch_id   UUID REFERENCES import_batches(id) ON DELETE CASCADE,
  raw_data          JSONB,                     -- the original CSV row, untouched, for auditing
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- duplicate protection: the same source-specific identity can only be stored once
CREATE UNIQUE INDEX IF NOT EXISTS financial_transactions_dedupe_uq ON financial_transactions (source, dedupe_key);

CREATE INDEX IF NOT EXISTS ft_date_idx            ON financial_transactions (transaction_date DESC);
CREATE INDEX IF NOT EXISTS ft_source_date_idx     ON financial_transactions (source, transaction_date DESC);
CREATE INDEX IF NOT EXISTS ft_txid_idx            ON financial_transactions (transaction_id);
CREATE INDEX IF NOT EXISTS ft_sender_phone_idx    ON financial_transactions (sender_phone);
CREATE INDEX IF NOT EXISTS ft_receiver_phone_idx  ON financial_transactions (receiver_phone);
CREATE INDEX IF NOT EXISTS ft_sender_name_idx     ON financial_transactions (lower(sender_name));
CREATE INDEX IF NOT EXISTS ft_receiver_name_idx   ON financial_transactions (lower(receiver_name));
CREATE INDEX IF NOT EXISTS ft_batch_idx           ON financial_transactions (import_batch_id);
CREATE INDEX IF NOT EXISTS ft_type_idx            ON financial_transactions (transaction_type);

-- Fast partial name / phone search (ILIKE '%text%'). pg_trgm is available on Neon; if it
-- cannot be enabled the module still works, just with slower partial matching.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  CREATE INDEX IF NOT EXISTS ft_sender_name_trgm   ON financial_transactions USING gin (lower(sender_name) gin_trgm_ops);
  CREATE INDEX IF NOT EXISTS ft_receiver_name_trgm ON financial_transactions USING gin (lower(receiver_name) gin_trgm_ops);
  CREATE INDEX IF NOT EXISTS ft_sender_phone_trgm  ON financial_transactions USING gin (sender_phone gin_trgm_ops);
  CREATE INDEX IF NOT EXISTS ft_receiver_phone_trgm ON financial_transactions USING gin (receiver_phone gin_trgm_ops);
  CREATE INDEX IF NOT EXISTS ft_txid_trgm          ON financial_transactions USING gin (lower(transaction_id) gin_trgm_ops);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_trgm not available (%): partial search will use sequential scans', SQLERRM;
END $$;
