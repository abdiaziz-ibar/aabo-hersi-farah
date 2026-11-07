// Unit tests for the CSV reader, validators and source parsers.
// Run: npm test   (node --test, no database needed)
// The CSV strings below are synthetic FORMAT fixtures that exercise the code paths;
// they are not real customer data and are never loaded into any database.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readCsv, CsvError } from '../financial/csvReader.js';
import { normalizePhone, parseAmount, parseDate, parsePhone } from '../financial/normalize.js';
import { evcParser } from '../financial/evcParser.js';
import { salaamParser } from '../financial/salaamParser.js';

const buf = (s) => Buffer.from(s, 'utf8');

test('amounts: plain, thousands, european, negative, junk', () => {
  assert.equal(parseAmount('1,234.50').value, 1234.5);
  assert.equal(parseAmount('1.234,50').value, 1234.5);
  assert.equal(parseAmount('$25').value, 25);
  assert.equal(parseAmount('(40.00)').value, -40);
  assert.equal(parseAmount('12,5').value, 12.5);
  assert.equal(parseAmount('1,000').value, 1000);
  assert.ok(parseAmount('abc').error);
  assert.ok(parseAmount('').error);
});

test('dates: ISO, DMY, MDY option, textual month, impossible days', () => {
  assert.equal(parseDate('2025-03-04 10:15:00').value.toISOString(), '2025-03-04T07:15:00.000Z'); // +03:00
  assert.equal(parseDate('04/03/2025').value.toISOString(), '2025-03-03T21:00:00.000Z'); // 4 March, DMY
  assert.equal(parseDate('04/03/2025', 'MDY').value.toISOString(), '2025-04-02T21:00:00.000Z'); // 3 April, MDY
  assert.equal(parseDate('25/12/2024 11:30 PM').value.toISOString(), '2024-12-25T20:30:00.000Z');
  assert.equal(parseDate('5 Jan 2025').value.getUTCFullYear(), 2025);
  assert.ok(parseDate('31/02/2025').error);
  assert.ok(parseDate('not a date').error);
  assert.ok(parseDate('').error);
});

test('phones: normalised to digits with Somali country code', () => {
  assert.equal(normalizePhone('+252 61 123 4567'), '252611234567');
  assert.equal(normalizePhone('0611234567'), '252611234567');
  assert.equal(normalizePhone('611234567'), '252611234567');
  assert.ok(parsePhone('12').error);
  assert.equal(parsePhone('').value, null);
});

test('csv reader: delimiter + encoding detection, binary rejection', () => {
  const semi = readCsv(buf('a;b;c\n1;2;3\n4;5;6\n'));
  assert.equal(semi.delimiter, ';');
  assert.deepEqual(semi.headers, ['a', 'b', 'c']);
  assert.equal(semi.rows.length, 2);
  const latin = readCsv(Buffer.from('name,amt\nJos\xe9,5\n', 'latin1'));
  assert.equal(latin.encoding, 'Windows-1252');
  assert.equal(latin.rows[0].name, 'José');
  const bom = readCsv(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), buf('x,y\n1,2\n')]));
  assert.deepEqual(bom.headers, ['x', 'y']);
  assert.throws(() => readCsv(Buffer.from('PK\x03\x04junk')), CsvError);
  assert.throws(() => readCsv(buf('only,header\n')), CsvError);
  assert.throws(() => readCsv(Buffer.alloc(0)), CsvError);
});

test('explicit sender/receiver columns: both sides come from the file', () => {
  const m = { transaction_id: 'id', transaction_date: 'when', sender_name: 's', sender_phone: 'sp', receiver_name: 'r', receiver_phone: 'rp', amount: 'amt' };
  const r = evcParser.parseRow({ id: 'T1', when: '2025-01-05 09:00', s: 'Ali', sp: '0611111111', r: 'Hodan', rp: '0622222222', amt: '10.50' }, m, {});
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(r.record.sender_phone, '252611111111');
  assert.equal(r.record.receiver_phone, '252622222222');
  assert.equal(r.record.transaction_type, 'TRANSFER'); // no statement holder given → perspective unknown
  assert.equal(r.record.amount, 10.5);
  // statement holder = receiver → RECEIVED
  const r2 = evcParser.parseRow({ id: 'T1', when: '2025-01-05 09:00', s: 'Ali', sp: '0611111111', r: 'Hodan', rp: '0622222222', amt: '10.50' }, m, { ownerPhone: '0622222222' });
  assert.equal(r2.record.transaction_type, 'RECEIVED');
});

test('the same transaction seen from two statements gets the same duplicate key', () => {
  const m = { transaction_id: 'id', transaction_date: 'when', sender_phone: 'sp', receiver_phone: 'rp', amount: 'amt' };
  const row = { id: 'T9', when: '2025-01-05 09:00', sp: '0611111111', rp: '0622222222', amt: '7' };
  const a = evcParser.parseRow(row, m, { ownerPhone: '0611111111' }).record;
  const b = evcParser.parseRow(row, m, { ownerPhone: '0622222222' }).record;
  assert.equal(a.transaction_type, 'SENT');
  assert.equal(b.transaction_type, 'RECEIVED');
  assert.equal(a.dedupe_key, b.dedupe_key);
});

test('one-sided bank statement: needs holder + explicit debit/credit, never guessed', () => {
  const m = { transaction_date: 'd', debit: 'dr', credit: 'cr', counterparty_name: 'who', counterparty_phone: 'ph' };
  const opts = { ownerName: 'Account Holder', ownerPhone: '0633333333' };
  const out = salaamParser.parseRow({ d: '2025-02-01', dr: '20.00', cr: '', who: 'Shop', ph: '' }, m, opts);
  assert.ok(out.ok);
  assert.equal(out.record.transaction_type, 'SENT');
  assert.equal(out.record.sender_phone, '252633333333');
  assert.equal(out.record.receiver_name, 'Shop');
  const inn = salaamParser.parseRow({ d: '2025-02-02', dr: '', cr: '5', who: 'Payer', ph: '' }, m, opts);
  assert.equal(inn.record.transaction_type, 'RECEIVED');
  assert.equal(inn.record.receiver_phone, '252633333333');
  // without the statement holder the direction cannot be resolved → row rejected, not guessed
  const bad = salaamParser.parseRow({ d: '2025-02-02', dr: '', cr: '5', who: 'Payer', ph: '' }, m, {});
  assert.equal(bad.ok, false);
  // both debit and credit filled → rejected
  const both = salaamParser.parseRow({ d: '2025-02-02', dr: '1', cr: '5', who: 'x', ph: '' }, m, opts);
  assert.equal(both.ok, false);
});

test('direction column uses only the sent/received values the admin configured', () => {
  const m = { transaction_date: 'd', amount: 'a', direction: 'type', counterparty_phone: 'ph' };
  const opts = { ownerPhone: '0644444444', sentValues: 'out, send', receivedValues: 'in' };
  assert.equal(evcParser.parseRow({ d: '2025-02-01', a: '3', type: 'OUT', ph: '0655555555' }, m, opts).record.transaction_type, 'SENT');
  assert.equal(evcParser.parseRow({ d: '2025-02-01', a: '3', type: 'in', ph: '0655555555' }, m, opts).record.transaction_type, 'RECEIVED');
  assert.equal(evcParser.parseRow({ d: '2025-02-01', a: '3', type: 'fee', ph: '0655555555' }, m, opts).ok, false);
});

test('invalid rows report every problem', () => {
  const m = { transaction_date: 'd', amount: 'a', sender_phone: 'sp', receiver_phone: 'rp' };
  const r = evcParser.parseRow({ d: '99/99/2025', a: 'x', sp: '1', rp: '0622222222' }, m, {});
  assert.equal(r.ok, false);
  assert.ok(r.errors.length >= 3, r.errors.join('; '));
});
