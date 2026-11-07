# Financial Transactions module (EVC Plus + Salaam Bank)

Upload EVC Plus and Salaam Bank CSV files, store them in one PostgreSQL table, then search any person by
name, phone number or transaction ID and see their full history with accurate totals.
No AI / LLM / external service is used anywhere: everything is SQL + normal Node.js code.

> **Important – parsers are provisional.** No real EVC Plus or Salaam Bank file was available when this was built, so
> the parsers do **not** assume any column names. Every import shows the real columns found in the file and you
> choose what each one means (the page pre-selects likely matches using generic header names only).
> Please send one sample file from each source (remove or change customer data if you like — only the
> header row and a few rows of the same *shape* are needed). Then `evcParser.js` / `salaamParser.js` can be
> tightened to the exact columns, and the "who sent / who received" rules confirmed against real data.

## What was added (existing modules untouched)

| Area | Files |
|---|---|
| Migration | `backend/migrations/001_financial_transactions.sql`, runner `backend/migrate.js` (runs automatically at server start, each file once, recorded in `schema_migrations`) |
| Parsers | `backend/financial/evcParser.js`, `salaamParser.js` (both built on `baseParser.js`) |
| Import pipeline | `csvReader.js` (encoding + delimiter detection, safe in-memory parsing), `normalize.js` (date / amount / phone / ID validation), `importer.js` (preview + one-DB-transaction import) |
| Search + reports | `queries.js` (all SQL, parameterised), `exporter.js` (CSV / XLSX), `router.js` (REST API) |
| Edited existing files (small, additive) | `backend/index.js` (mount router, run migrations), `backend/db.js` (`DB_SSL=false` switch for local test DBs only), `frontend/src/App.tsx`, `components/Sidebar.tsx`, `components/TabBar.tsx` |
| Frontend | `frontend/src/pages/fin/` → `CsvImport`, `TxSearch`, `CustomerDetail`, `TxReports`; `components/fin/` (`parts`, `TxTable`); `lib/finApi.ts`; `fin.css` |
| Tests | `backend/test/financial.parsers.test.js` (`npm test`) |

Sidebar: **Transactions → CSV Import / Transaction Search / Transaction Reports** (admins only; on phones one "Transactions" tab).

## Database

* `import_batches` – one row per uploaded file (filename, source, row counts, mapping used, first invalid rows, who imported).
* `financial_transactions` – the unified table you specified, plus `dedupe_key` (unique with `source`). `raw_data` (JSONB) keeps the untouched CSV row.
* Indexes on source, date, transaction ID, sender/receiver phone and lower-cased names; trigram (`pg_trgm`) indexes make partial name/phone search fast (Neon supports the extension; if it cannot be enabled the module still works).
* Nothing existing is altered or dropped.

### How sender / receiver / type are decided (no guessing)

1. If the row has sender and receiver columns → both come straight from the file.
2. Otherwise (a statement with one account holder) you enter the **statement holder** on the import page and map a *direction* column (and tell the system which values mean sent / received), **or** debit + credit columns, **or** choose "negative amount = sent". A debit is only treated as "holder sent" because you mapped it that way.
3. If the row cannot be resolved it is **rejected with an explanation**, never silently guessed.
4. `transaction_type`: holder is the sender → `SENT`; holder is the receiver → `RECEIVED`; sender = receiver → `TRANSFER`; no holder known → `TRANSFER`.

### Duplicate prevention
Identity = source + (transaction ID + amount + sender + receiver), or, when the file has no transaction ID, a hash of date/amount/people/reference/description. The same transaction appearing in two different statements therefore matches. Re-importing a file skips what already exists (shown as "duplicates").
Caveat: two genuinely identical ID-less rows (same minute, amount and people) look like one transaction.

### Totals never double-count
For a customer, each transaction is counted once: **received** = they are the receiver and not the sender, **sent** = they are the sender and not the receiver, **transfers** = both (shown separately, never added to either). Totals are always per currency. Reports use one currency at a time; their "sent / received" follow each row's `transaction_type`.

## API  (`/api/financial-transactions`, JWT + admin role on every route)

> The suggested path `/api/transactions/...` is already used by your bookkeeping module (`GET/POST /api/transactions`, `DELETE /api/transactions/:id`), so this module lives under `/api/financial-transactions` to avoid any conflict.

| Method & path | Purpose |
|---|---|
| `POST /import/evc/preview`, `POST /import/salaam/preview` | multipart: `file`, `mapping` (JSON), `options` (JSON). Returns headers, delimiter, encoding, sample rows, validation counts, row errors. Saves nothing. |
| `POST /import/evc`, `POST /import/salaam` | Same fields; imports valid rows in one DB transaction. Returns `{batchId,total,imported,duplicates,invalid,errors}`. |
| `GET /batches`, `DELETE /batches/:id` | Import history; remove an import (and only its rows). |
| `GET /search` | Query: `name`, `phone`, `exact`, `txId`, `source`, `type`, `from`, `to`, `minAmount`, `maxAmount`, `page`, `pageSize` (≤200), `sort` (`date,amount,id,sender,receiver,source,type,currency`), `dir`. Returns matching people and **all** matching transactions (paginated). |
| `GET /` | Same transaction list without the people cards. |
| `GET /customer/:key` | Profile + totals (per currency and per source) + paginated history. `key` = `p:<phone digits>` or `n:<lowercase name>`. Accepts source/type/date filters. |
| `GET /customer/:key/export?format=csv\|xlsx` | Complete history export. |
| `GET /export?format=csv\|xlsx` | Export for any search filters (limit `FIN_EXPORT_MAX`). |
| `GET /reports/summary?period=daily\|weekly\|monthly` | Totals, period series, EVC-vs-Salaam comparison. Filters: `from,to,source,currency`. |
| `GET /reports/top-customers?limit=10` | Top senders, top receivers, most active phones. |
| `GET /reports/export?report=summary\|sources\|senders\|receivers\|active&format=csv\|xlsx` | Report exports. |
| `GET /meta` | Counts, currencies, date range. |

## Security
JWT on all routes **and** admin-only (staff accounts get 403 — these are customers' financial records). Parameterised SQL only (sort columns are whitelisted; `%`/`_` in searches are escaped). Uploads: `.csv`/`.txt` only, size-capped (`FIN_MAX_UPLOAD_MB`, default 10), kept in memory, never written to disk or executed; ZIP/PDF/binary content rejected. Exports neutralise spreadsheet formulas. Imports, deletions and exports are written to the existing audit log (`fin_import`, `fin_import_deleted`, `fin_export`). No data leaves your server.

## Packages and environment
Backend: `npm install` adds `multer`, `csv-parse`, `exceljs`. Frontend: no new packages.
Optional env vars (in `backend/.env`): `FIN_MAX_UPLOAD_MB` (10), `FIN_MAX_ROWS` (100000 rows per file), `FIN_EXPORT_MAX` (200000), `FIN_TZ_OFFSET` (`+03:00`, applied to dates that carry no time zone). Nothing else is required.

## Install
```bash
cd backend && npm install
cd ../frontend && npm install
```
Start the backend as usual (`npm run dev` in `backend`); the migration runs automatically on startup. Then `npm run dev` in `frontend` (or `npm run build` if the backend serves `frontend/dist`). Run the unit tests with `npm test` in `backend`.

## Uploading files
1. Sign in as an **admin** → **CSV Import**.
2. Choose **EVC Plus** or **Salaam Bank**, drop the CSV (max 10 MB; encoding and delimiter are detected).
3. Check the column matching. For a file with one account holder, fill in *Statement holder* and the direction / debit / credit settings.
4. Review valid / invalid counts, the invalid-row explanations and the "how rows will be saved" preview. Files with more than 1,000 valid rows ask for confirmation.
5. **Import**. The result shows imported / skipped-as-duplicate / invalid counts, and the file appears in *Import history* (where a wrong import can be removed).

## Test results (what was actually run)
* `npm test` (9 unit tests: amounts, dates, phones, CSV encoding/delimiters/binary rejection, sender/receiver resolution, duplicate keys, invalid rows) – all pass.
* 23 end-to-end API checks against a real PostgreSQL engine (PGlite) and the real backend process – all pass: JWT (401 without token, 403 for staff), existing `/api/transactions` still works, preview, both imports, invalid files, 413 oversize, duplicate prevention, search by phone / name / transaction ID, source / type / date / amount filters, pagination over all rows, customer totals without double counting, SQL-injection attempts, CSV and XLSX exports, all report endpoints, import history + audit log, delete import, idempotent migration.
* Frontend: `tsc` type-check and production build pass; import, search, customer and report pages were exercised in a browser against that test instance.
* All test data was synthetic and lived only in a throw-away in-memory database. **Not tested:** the real EVC Plus / Salaam Bank file layouts (no samples), and your Neon database (the migration will run there the next time the backend starts).
