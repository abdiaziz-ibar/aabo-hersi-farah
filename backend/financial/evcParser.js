import { createParser } from './baseParser.js';

/**
 * EVC Plus parser.
 *
 * PROVISIONAL: no real EVC Plus export was available when this was written, so the header
 * aliases below are only *suggestions* for the column-mapping screen (generic wording, not the
 * real file layout). The admin confirms/changes the mapping on the import page for every file,
 * and the parser only ever uses that confirmed mapping. Once a real sample is provided, tighten
 * `aliases` (and defaults) here to match its exact columns.
 */
export const evcParser = createParser({
  source: 'EVC_PLUS',
  label: 'EVC Plus',
  defaultCurrency: 'USD',
  aliases: {
    transaction_id: ['transaction id', 'transactionid', 'txn id', 'trx id', 'id'],
    transaction_date: ['date', 'transaction date', 'date time', 'datetime', 'timestamp', 'time'],
    sender_name: ['sender name', 'sender', 'from name', 'from'],
    sender_phone: ['sender phone', 'sender number', 'sender msisdn', 'from phone', 'from number'],
    receiver_name: ['receiver name', 'receiver', 'recipient name', 'recipient', 'to name', 'to'],
    receiver_phone: ['receiver phone', 'receiver number', 'receiver msisdn', 'recipient phone', 'to phone', 'to number'],
    counterparty_name: ['counterparty name', 'counterparty', 'other party name', 'customer name', 'name'],
    counterparty_phone: ['counterparty phone', 'counterparty number', 'other party phone', 'customer phone', 'phone', 'phone number', 'msisdn'],
    amount: ['amount', 'transaction amount', 'value'],
    debit: ['debit', 'dr', 'money out', 'paid out'],
    credit: ['credit', 'cr', 'money in', 'paid in'],
    direction: ['type', 'transaction type', 'direction', 'dr cr'],
    currency: ['currency', 'ccy'],
    description: ['description', 'details', 'narration', 'remarks', 'note', 'memo'],
    reference_number: ['reference', 'reference number', 'ref', 'ref no', 'reference no'],
  },
});
