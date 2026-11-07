import crypto from 'node:crypto';
import {
  cleanText, normalizePhone, parseAmount, parseCurrency, parseDate, parsePhone, parseTxId,
} from './normalize.js';

/**
 * Normalised fields a CSV column can be mapped to.
 * counterparty_* are mapping helpers only: "the other person" in a one-sided statement.
 */
export const FIELDS = [
  'transaction_id', 'transaction_date', 'sender_name', 'sender_phone', 'receiver_name', 'receiver_phone',
  'counterparty_name', 'counterparty_phone', 'amount', 'debit', 'credit', 'direction', 'currency',
  'description', 'reference_number',
];

const norm = (h) => String(h).toLowerCase().replace(/[^a-z0-9]/g, '');
const split = (v) => String(v ?? '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
const key = (p) => (p.phone || (p.name ? p.name.toLowerCase() : ''));
const has = (p) => Boolean(p.name || p.phone);
const sameParty = (a, b) => has(a) && has(b) && ((a.phone && b.phone && a.phone === b.phone) || (!a.phone && !b.phone && a.name?.toLowerCase() === b.name?.toLowerCase()));

/**
 * Builds a source-specific parser. Each source (EVC Plus, Salaam Bank) supplies its own
 * header aliases and defaults; the row logic below never guesses direction on its own:
 * who sent and who received comes from explicit sender/receiver columns, or from the
 * statement holder (owner) plus an explicit direction / debit / credit / signed amount.
 */
export function createParser({ source, label, defaultCurrency, aliases }) {
  /** Suggest a column for each field from the actual headers in the file. */
  function suggestMapping(headers) {
    const out = {};
    const taken = new Set();
    for (const f of FIELDS) {
      const want = (aliases[f] ?? []).map(norm);
      const hit = headers.find((h) => !taken.has(h) && want.includes(norm(h)));
      if (hit) { out[f] = hit; taken.add(hit); }
    }
    return out;
  }

  function parseRow(cells, mapping, opts = {}) {
    const errors = [];
    const get = (f) => (mapping[f] ? cells[mapping[f]] ?? '' : '');
    const dateOrder = opts.dateOrder === 'MDY' ? 'MDY' : 'DMY';

    // ---- date
    let date = null;
    if (!mapping.transaction_date) errors.push('no column is mapped to the transaction date');
    else { const r = parseDate(get('transaction_date'), dateOrder); if (r.error) errors.push(r.error); else date = r.value; }

    // ---- transaction id
    const tid = parseTxId(get('transaction_id'));
    if (tid.error) errors.push(tid.error);

    // ---- people
    const person = (nameF, phoneF) => {
      const p = parsePhone(get(phoneF));
      if (p.error) errors.push(p.error);
      return { name: cleanText(get(nameF), 150), phone: p.value ?? null };
    };
    const s = person('sender_name', 'sender_phone');
    const r = person('receiver_name', 'receiver_phone');
    const c = person('counterparty_name', 'counterparty_phone');
    const ownerPhone = normalizePhone(opts.ownerPhone);
    const owner = { name: cleanText(opts.ownerName, 150), phone: ownerPhone || null };

    // ---- amount + direction
    let amount = null;
    let dir = null; // 'OUT' (statement holder paid) | 'IN' (statement holder was paid)
    let negative = false;
    if (mapping.debit || mapping.credit) {
      const d = mapping.debit ? parseAmount(get('debit')) : { value: 0 };
      const cr = mapping.credit ? parseAmount(get('credit')) : { value: 0 };
      const dBlank = !mapping.debit || !String(get('debit')).trim();
      const cBlank = !mapping.credit || !String(get('credit')).trim();
      if (!dBlank && d.error) errors.push(`debit: ${d.error}`);
      else if (!cBlank && cr.error) errors.push(`credit: ${cr.error}`);
      else if (!dBlank && !cBlank && Math.abs(d.value) > 0 && Math.abs(cr.value) > 0) errors.push('both debit and credit have an amount');
      else if (!dBlank && Math.abs(d.value) > 0) { amount = Math.abs(d.value); dir = 'OUT'; }
      else if (!cBlank && Math.abs(cr.value) > 0) { amount = Math.abs(cr.value); dir = 'IN'; }
      else errors.push('debit and credit are both empty or zero');
    } else if (mapping.amount) {
      const a = parseAmount(get('amount'));
      if (a.error) errors.push(a.error);
      else { amount = Math.abs(a.value); negative = a.value < 0; }
    } else {
      errors.push('no column is mapped to the amount (or debit/credit)');
    }
    if (amount !== null && !(amount > 0)) { errors.push('amount must be greater than zero'); amount = null; }

    if (mapping.direction && !dir) {
      const v = String(get('direction')).trim().toLowerCase();
      const sent = split(opts.sentValues);
      const received = split(opts.receivedValues);
      if (sent.includes(v)) dir = 'OUT';
      else if (received.includes(v)) dir = 'IN';
      else errors.push(`direction value "${get('direction')}" is not in the "sent" or "received" lists you configured`);
    } else if (!dir && opts.amountSign === 'negative_is_sent' && mapping.amount && amount !== null) {
      dir = negative ? 'OUT' : 'IN';
    }

    // ---- who sent / who received
    let sender = null;
    let receiver = null;
    if (has(s) && has(r)) {
      sender = s; receiver = r;
    } else if (dir && has(owner)) {
      // one-sided statement: the other person is the counterparty column, or the single filled side
      let other = c;
      if (!has(other)) other = has(s) && !sameParty(s, owner) ? s : has(r) && !sameParty(r, owner) ? r : { name: null, phone: null };
      if (!has(other) && !opts.allowMissingCounterparty) {
        errors.push('the other party (name/phone) is empty — map a counterparty column or allow missing counterparties');
      }
      if (dir === 'OUT') { sender = owner; receiver = other; } else { sender = other; receiver = owner; }
    } else if (has(owner) && (has(s) !== has(r))) {
      // one side given, no direction: the statement holder is the missing side
      if (has(s)) { sender = s; receiver = owner; } else { sender = owner; receiver = r; }
    } else {
      errors.push(
        has(s) || has(r) || has(c)
          ? 'cannot tell who sent and who received — map both sender and receiver columns, or enter the statement holder and map a direction / debit / credit column'
          : 'no sender/receiver information found in this row',
      );
    }
    if (sender && receiver && !has(sender) && !has(receiver)) errors.push('sender and receiver are both empty');

    // ---- currency
    const cur = parseCurrency(get('currency'), opts.defaultCurrency || defaultCurrency);
    if (cur.error) errors.push(cur.error);

    if (errors.length) return { ok: false, errors };

    // ---- type (always from explicit data, never from a column's sign alone)
    let type = 'TRANSFER';
    if (sameParty(sender, receiver)) type = 'TRANSFER';
    else if (has(owner) && sameParty(sender, owner)) type = 'SENT';
    else if (has(owner) && sameParty(receiver, owner)) type = 'RECEIVED';
    else if (dir === 'OUT') type = 'SENT';
    else if (dir === 'IN') type = 'RECEIVED';

    const reference = cleanText(get('reference_number'), 100);
    // Duplicate identity: the source's own transaction id when there is one (plus amount and both
    // parties, so the same transaction seen from two different statements still matches),
    // otherwise a hash of the row's stable fields.
    const parties = `${key(sender)}>${key(receiver)}`;
    const dedupe = tid.value
      ? `tid:${tid.value}|${amount.toFixed(2)}|${parties}`
      : `row:${crypto.createHash('sha1').update([date.toISOString(), amount.toFixed(2), parties, reference ?? '', cleanText(get('description')) ?? ''].join('|')).digest('hex')}`;

    return {
      ok: true,
      record: {
        source,
        transaction_id: tid.value,
        dedupe_key: dedupe,
        transaction_date: date,
        sender_name: sender.name,
        sender_phone: sender.phone,
        receiver_name: receiver.name,
        receiver_phone: receiver.phone,
        amount,
        currency: cur.value,
        transaction_type: type,
        description: cleanText(get('description'), 500),
        reference_number: reference,
      },
    };
  }

  return { source, label, defaultCurrency, aliases, suggestMapping, parseRow };
}
