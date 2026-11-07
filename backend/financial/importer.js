import { pool } from '../db.js';
import { FIELDS } from './baseParser.js';
import { readCsv } from './csvReader.js';
import { evcParser } from './evcParser.js';
import { salaamParser } from './salaamParser.js';

export const PARSERS = { evc: evcParser, salaam: salaamParser };
const MAX_ROWS = Number(process.env.FIN_MAX_ROWS) || 100_000;
const ERROR_SAMPLE = 200;
const CHUNK = 500;

export class ImportError extends Error {}

/** Keep only known fields mapped to columns that really exist in the file. */
export function cleanMapping(mapping, headers) {
  const out = {};
  for (const f of FIELDS) {
    const col = mapping?.[f];
    if (typeof col === 'string' && col && headers.includes(col)) out[f] = col;
  }
  return out;
}

export function cleanOptions(o = {}) {
  const txt = (v, n) => String(v ?? '').trim().slice(0, n);
  return {
    ownerName: txt(o.ownerName, 150),
    ownerPhone: txt(o.ownerPhone, 30),
    dateOrder: o.dateOrder === 'MDY' ? 'MDY' : 'DMY',
    sentValues: txt(o.sentValues, 300),
    receivedValues: txt(o.receivedValues, 300),
    amountSign: o.amountSign === 'negative_is_sent' ? 'negative_is_sent' : 'none',
    defaultCurrency: /^[A-Za-z]{2,5}$/.test(txt(o.defaultCurrency, 5)) ? txt(o.defaultCurrency, 5).toUpperCase() : '',
    allowMissingCounterparty: o.allowMissingCounterparty === true || o.allowMissingCounterparty === 'true',
  };
}

/** Parse + validate the whole file without touching the database. */
export function analyze(buf, parser, rawMapping, rawOpts) {
  const csv = readCsv(buf, { delimiter: rawOpts?.delimiter });
  if (csv.rows.length > MAX_ROWS) throw new ImportError(`The file has ${csv.rows.length} rows; the limit is ${MAX_ROWS}. Split it into smaller files.`);
  const suggested = parser.suggestMapping(csv.headers);
  const mapping = rawMapping && Object.keys(rawMapping).length ? cleanMapping(rawMapping, csv.headers) : suggested;
  const opts = cleanOptions(rawOpts);
  const valid = [];
  const invalid = [];
  for (const cells of csv.rows) {
    const { __row, ...raw } = cells;
    const r = parser.parseRow(cells, mapping, opts);
    if (r.ok) valid.push({ row: __row, record: r.record, raw });
    else invalid.push({ row: __row, errors: r.errors, raw });
  }
  return { csv, suggested, mapping, opts, valid, invalid };
}

const COLS = [
  'source', 'transaction_id', 'dedupe_key', 'transaction_date', 'sender_name', 'sender_phone', 'receiver_name',
  'receiver_phone', 'amount', 'currency', 'transaction_type', 'description', 'reference_number', 'import_batch_id', 'raw_data',
];

/** Import all valid rows inside ONE database transaction (all-or-nothing). */
export async function commitImport({ parser, filename, buf, mapping, options, user }) {
  const a = analyze(buf, parser, mapping, options);
  if (!a.valid.length) throw new ImportError('There are no valid rows to import. Check the column mapping and the errors shown.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [batch] } = await client.query(
      `INSERT INTO import_batches (source, filename, file_sha256, file_size, encoding, delimiter, total_rows, invalid_rows, mapping, options, error_sample, imported_by, imported_by_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [parser.source, filename.slice(0, 200), a.csv.sha256, buf.length, a.csv.encoding, a.csv.delimiter, a.csv.rows.length, a.invalid.length,
        JSON.stringify(a.mapping), JSON.stringify(a.opts), JSON.stringify(a.invalid.slice(0, ERROR_SAMPLE)),
        user?.id ?? null, String(user?.username ?? '').slice(0, 60)],
    );
    let imported = 0;
    for (let i = 0; i < a.valid.length; i += CHUNK) {
      const part = a.valid.slice(i, i + CHUNK);
      const params = [];
      const tuples = part.map((v, n) => {
        const r = v.record;
        params.push(r.source, r.transaction_id, r.dedupe_key, r.transaction_date, r.sender_name, r.sender_phone, r.receiver_name,
          r.receiver_phone, r.amount, r.currency, r.transaction_type, r.description, r.reference_number, batch.id,
          JSON.stringify({ ...v.raw, _csv_row: v.row }));
        return `(${COLS.map((_, c) => `$${n * COLS.length + c + 1}`).join(',')})`;
      });
      const res = await client.query(
        `INSERT INTO financial_transactions (${COLS.join(',')}) VALUES ${tuples.join(',')}
         ON CONFLICT (source, dedupe_key) DO NOTHING`, params);
      imported += res.rowCount;
    }
    const duplicates = a.valid.length - imported;
    await client.query('UPDATE import_batches SET imported_rows = $2, duplicate_rows = $3 WHERE id = $1', [batch.id, imported, duplicates]);
    await client.query('COMMIT');
    return {
      batchId: batch.id, total: a.csv.rows.length, imported, duplicates, invalid: a.invalid.length,
      errors: a.invalid.slice(0, ERROR_SAMPLE).map(({ row, errors }) => ({ row, errors })),
    };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
