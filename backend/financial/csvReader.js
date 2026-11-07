import crypto from 'node:crypto';
import { parse } from 'csv-parse/sync';

export class CsvError extends Error {}

/** Decode the raw bytes: BOM first, then strict UTF-8, then Windows-1252 as a last resort. */
export function decodeBuffer(buf) {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return { text: new TextDecoder('utf-16le').decode(buf.subarray(2)), encoding: 'UTF-16LE' };
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) return { text: new TextDecoder('utf-16be').decode(buf.subarray(2)), encoding: 'UTF-16BE' };
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return { text: new TextDecoder('utf-8').decode(buf.subarray(3)), encoding: 'UTF-8 (BOM)' };
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(buf), encoding: 'UTF-8' };
  } catch {
    return { text: new TextDecoder('windows-1252').decode(buf), encoding: 'Windows-1252' };
  }
}

/** Pick the delimiter whose column count is the most consistent across the first lines. */
export function detectDelimiter(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 15);
  let best = ',';
  let bestScore = -1;
  for (const d of [',', ';', '\t', '|']) {
    const counts = lines.map((l) => {
      let n = 0;
      let q = false;
      for (const ch of l) {
        if (ch === '"') q = !q;
        else if (ch === d && !q) n++;
      }
      return n;
    });
    const first = counts[0] ?? 0;
    if (!first) continue;
    const consistent = counts.filter((c) => c === first).length;
    const score = consistent * 1000 + first;
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

/**
 * Safe, in-memory CSV parse. Files are never written to disk and never executed.
 * Returns { headers, rows: [{__row, ...cells}], encoding, delimiter, sha256 }.
 */
export function readCsv(buf, { delimiter } = {}) {
  if (!buf?.length) throw new CsvError('The file is empty.');
  if (buf.subarray(0, 4).toString('latin1').startsWith('PK')) throw new CsvError('This looks like an Excel/ZIP file, not a CSV. Export it as CSV first.');
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') throw new CsvError('This is a PDF, not a CSV file.');
  const { text, encoding } = decodeBuffer(buf);
  if (text.includes('\u0000')) throw new CsvError('The file contains binary data and is not a text CSV.');
  const delim = delimiter && [',', ';', '\t', '|'].includes(delimiter) ? delimiter : detectDelimiter(text);

  let records;
  try {
    records = parse(text, {
      delimiter: delim,
      bom: true,
      relax_column_count: true,
      relax_quotes: true,
      skip_empty_lines: true,
      trim: true,
    });
  } catch (e) {
    throw new CsvError(`Could not read the CSV: ${e.message}`);
  }
  if (records.length < 2) throw new CsvError('The CSV needs a header row and at least one data row.');

  const seen = new Map();
  const headers = records[0].map((h, i) => {
    let name = String(h ?? '').trim() || `column_${i + 1}`;
    const n = (seen.get(name) ?? 0) + 1;
    seen.set(name, n);
    if (n > 1) name = `${name} (${n})`;
    return name;
  });
  const rows = records.slice(1).map((r, i) => {
    const o = { __row: i + 2 }; // spreadsheet row number: header is row 1
    headers.forEach((h, c) => { o[h] = r[c] ?? ''; });
    return o;
  });
  return {
    headers, rows, encoding, delimiter: delim,
    sha256: crypto.createHash('sha256').update(buf).digest('hex'),
  };
}
