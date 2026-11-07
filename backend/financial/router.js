import express from 'express';
import multer from 'multer';
import { requireAdmin, requireAuth } from '../auth.js';
import { audit } from '../audit.js';
import { pool } from '../db.js';
import { CsvError } from './csvReader.js';
import { SOURCE_LABEL, TX_COLUMNS, sendTable, txRow } from './exporter.js';
import { ImportError, PARSERS, analyze, commitImport } from './importer.js';
import {
  QueryError, allTransactions, customerProfile, listBatches, listTransactions, meta, parseCustomerKey, parseFilters,
  reportSummary, reportTopCustomers, searchCustomers,
} from './queries.js';

/**
 * Financial transactions (EVC Plus / Salaam Bank CSV imports).
 * Mounted at /api/financial-transactions. Every endpoint needs a valid JWT AND the admin role:
 * these files contain customers' financial data, so staff accounts have no access.
 */
export const financial = express.Router();

const MAX_MB = Number(process.env.FIN_MAX_UPLOAD_MB) || 10;
const EXPORT_MAX = Number(process.env.FIN_EXPORT_MAX) || 200_000;

const upload = multer({
  storage: multer.memoryStorage(), // never written to disk, never executed
  limits: { fileSize: MAX_MB * 1024 * 1024, files: 1, fields: 40, fieldSize: 20_000 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(csv|txt)$/i.test(file.originalname ?? '');
    cb(ok ? null : new ImportError('Only .csv files are accepted.'), ok);
  },
});

const wrap = (fn) => (req, res, next) =>
  fn(req, res).catch((e) => {
    if (e instanceof QueryError || e instanceof CsvError || e instanceof ImportError) return res.status(400).json({ error: e.message });
    if (e instanceof multer.MulterError) {
      return res.status(e.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: e.code === 'LIMIT_FILE_SIZE' ? `The file is larger than ${MAX_MB} MB.` : e.message });
    }
    return next(e);
  });

const uploadOne = (req, res, next) => upload.single('file')(req, res, (e) => {
  if (!e) return next();
  if (e instanceof ImportError) return res.status(400).json({ error: e.message });
  if (e instanceof multer.MulterError) {
    return res.status(e.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: e.code === 'LIMIT_FILE_SIZE' ? `The file is larger than ${MAX_MB} MB.` : e.message });
  }
  return next(e);
});

const json = (v, what) => {
  if (v == null || v === '') return {};
  try {
    const o = JSON.parse(v);
    if (o && typeof o === 'object' && !Array.isArray(o)) return o;
  } catch { /* fall through */ }
  throw new ImportError(`${what} is not valid JSON.`);
};

financial.use(requireAuth, requireAdmin);

/* ---------------------------- import ---------------------------- */

const withSource = (req, res, next) => {
  req.parser = PARSERS[req.params.source];
  if (!req.parser) return res.status(404).json({ error: 'Unknown source. Use "evc" or "salaam".' });
  next();
};

// Step 1: read the file, show headers/sample/validation — nothing is saved.
financial.post('/import/:source/preview', withSource, uploadOne, wrap(async (req, res) => {
  if (!req.file) throw new ImportError('Choose a CSV file first.');
  const a = analyze(req.file.buffer, req.parser, json(req.body.mapping, 'mapping'), json(req.body.options, 'options'));
  res.json({
    source: req.parser.source,
    filename: req.file.originalname,
    encoding: a.csv.encoding,
    delimiter: a.csv.delimiter,
    headers: a.csv.headers,
    totalRows: a.csv.rows.length,
    validRows: a.valid.length,
    invalidRows: a.invalid.length,
    mapping: a.mapping,
    suggestedMapping: a.suggested,
    sample: a.csv.rows.slice(0, 15).map(({ __row, ...cells }) => ({ row: __row, cells })),
    errors: a.invalid.slice(0, 100).map(({ row, errors, raw }) => ({ row, errors, raw })),
    parsedSample: a.valid.slice(0, 5).map((v) => ({ row: v.row, ...v.record, transaction_date: v.record.transaction_date.toISOString() })),
  });
}));

// Step 2: import the valid rows in one DB transaction.
financial.post('/import/:source', withSource, uploadOne, wrap(async (req, res) => {
  if (!req.file) throw new ImportError('Choose a CSV file first.');
  const result = await commitImport({
    parser: req.parser,
    filename: req.file.originalname,
    buf: req.file.buffer,
    mapping: json(req.body.mapping, 'mapping'),
    options: json(req.body.options, 'options'),
    user: req.user,
  });
  await audit(req, 'fin_import', `${req.parser.source} ${req.file.originalname}`.slice(0, 80),
    `batch ${result.batchId}: ${result.imported} imported, ${result.duplicates} duplicate, ${result.invalid} invalid`);
  res.status(201).json(result);
}));

financial.get('/batches', wrap(async (_req, res) => res.json(await listBatches())));

financial.delete('/batches/:id', wrap(async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(400).json({ error: 'Bad id' });
  const { rows } = await pool.query('DELETE FROM import_batches WHERE id = $1 RETURNING source, filename, imported_rows', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Import not found' });
  await audit(req, 'fin_import_deleted', `${rows[0].source} ${rows[0].filename}`.slice(0, 80), `${rows[0].imported_rows} transactions removed`);
  res.status(204).end();
}));

/* ---------------------------- read ---------------------------- */

financial.get('/meta', wrap(async (_req, res) => res.json(await meta())));

// Name / phone / transaction-id search: matching people + ALL matching transactions (paginated).
financial.get('/search', wrap(async (req, res) => {
  const f = parseFilters(req.query);
  const [tx, customers] = await Promise.all([
    listTransactions(f, req.query),
    f.nameTokens || f.phone || f.txId ? searchCustomers(f) : Promise.resolve([]),
  ]);
  res.json({ customers, transactions: tx });
}));

// Transactions list (same filters, no customer cards).
financial.get('/', wrap(async (req, res) => res.json(await listTransactions(parseFilters(req.query), req.query))));

financial.get('/export', wrap(async (req, res) => {
  const f = parseFilters(req.query);
  const rows = await allTransactions(f, req.query, EXPORT_MAX);
  if (rows.length > EXPORT_MAX) return res.status(413).json({ error: `Too many rows to export (limit ${EXPORT_MAX}). Narrow the filters.` });
  await audit(req, 'fin_export', 'transactions', `${rows.length} rows`);
  await sendTable(res, {
    format: req.query.format === 'xlsx' ? 'xlsx' : 'csv', filename: `transactions-${new Date().toISOString().slice(0, 10)}`,
    sheet: 'Transactions', columns: TX_COLUMNS, rows: rows.map(txRow),
  });
}));

financial.get('/customer/:key', wrap(async (req, res) => {
  const c = parseCustomerKey(req.params.key);
  const f = parseFilters({ ...req.query, customer: c.key, name: undefined, phone: undefined, txId: undefined });
  const profile = await customerProfile(f);
  if (!profile) return res.status(404).json({ error: 'No transactions found for this customer.' });
  res.json({ profile, transactions: await listTransactions(f, req.query) });
}));

financial.get('/customer/:key/export', wrap(async (req, res) => {
  const c = parseCustomerKey(req.params.key);
  const f = parseFilters({ ...req.query, customer: c.key, name: undefined, phone: undefined, txId: undefined });
  const rows = await allTransactions(f, req.query, EXPORT_MAX);
  if (!rows.length) return res.status(404).json({ error: 'No transactions found for this customer.' });
  await audit(req, 'fin_export', `customer ${c.key}`.slice(0, 80), `${rows.length} rows`);
  await sendTable(res, {
    format: req.query.format === 'xlsx' ? 'xlsx' : 'csv', filename: `customer-${c.val.replace(/\s+/g, '_')}-${new Date().toISOString().slice(0, 10)}`,
    sheet: 'Customer', columns: TX_COLUMNS, rows: rows.map(txRow),
  });
}));

/* ---------------------------- reports ---------------------------- */

financial.get('/reports/summary', wrap(async (req, res) => {
  res.json(await reportSummary(parseFilters({ ...req.query, name: undefined, phone: undefined, txId: undefined }), req.query.period));
}));

financial.get('/reports/top-customers', wrap(async (req, res) => {
  res.json(await reportTopCustomers(parseFilters({ ...req.query, name: undefined, phone: undefined, txId: undefined }), req.query.limit));
}));

const REPORT_COLS = {
  summary: [
    { header: 'Period', key: 'period' }, { header: 'Transactions', key: 'count' },
    { header: 'Received', key: 'received', numeric: true }, { header: 'Sent', key: 'sent', numeric: true },
    { header: 'Transfers', key: 'transfers', numeric: true }, { header: 'Total volume', key: 'volume', numeric: true },
  ],
  sources: [
    { header: 'Source', key: 'source' }, { header: 'Transactions', key: 'count' },
    { header: 'Received', key: 'received', numeric: true }, { header: 'Sent', key: 'sent', numeric: true },
    { header: 'Transfers', key: 'transfers', numeric: true }, { header: 'Total volume', key: 'volume', numeric: true },
    { header: 'Average', key: 'average', numeric: true }, { header: 'Largest', key: 'largest', numeric: true },
    { header: 'Distinct phones', key: 'phones' },
  ],
  senders: [{ header: 'Name', key: 'name', width: 26 }, { header: 'Phone', key: 'phone' }, { header: 'Transactions', key: 'count' }, { header: 'Total sent', key: 'total', numeric: true }],
  receivers: [{ header: 'Name', key: 'name', width: 26 }, { header: 'Phone', key: 'phone' }, { header: 'Transactions', key: 'count' }, { header: 'Total received', key: 'total', numeric: true }],
  active: [{ header: 'Phone', key: 'phone' }, { header: 'Name', key: 'name', width: 26 }, { header: 'Transactions', key: 'count' }, { header: 'Total amount', key: 'total', numeric: true }],
};

financial.get('/reports/export', wrap(async (req, res) => {
  const report = String(req.query.report ?? 'summary');
  if (!REPORT_COLS[report]) throw new QueryError('Unknown report.');
  const f = parseFilters({ ...req.query, name: undefined, phone: undefined, txId: undefined });
  let rows;
  if (report === 'summary' || report === 'sources') {
    const s = await reportSummary(f, req.query.period);
    rows = report === 'summary' ? s.series : s.sources.map((x) => ({ ...x, source: SOURCE_LABEL[x.source] }));
  } else {
    const t = await reportTopCustomers(f, req.query.limit);
    rows = { senders: t.topSenders, receivers: t.topReceivers, active: t.activePhones }[report];
  }
  await audit(req, 'fin_export', `report ${report}`, `${rows.length} rows`);
  await sendTable(res, {
    format: req.query.format === 'xlsx' ? 'xlsx' : 'csv', filename: `report-${report}-${new Date().toISOString().slice(0, 10)}`,
    sheet: report, columns: REPORT_COLS[report], rows,
  });
}));
