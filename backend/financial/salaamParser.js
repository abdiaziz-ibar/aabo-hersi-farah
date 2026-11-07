import { createParser } from './baseParser.js';

/**
 * Salaam Bank parser.
 *
 * PROVISIONAL: no real Salaam Bank statement was available when this was written, so the header
 * aliases below are only *suggestions* for the column-mapping screen (generic wording, not the
 * real file layout). The admin confirms/changes the mapping for every file and the parser only
 * uses that confirmed mapping. A bank statement is normally one-sided (the account holder plus
 * the other party), so the import page asks for the account holder and for how direction is
 * encoded (debit/credit columns, a type column, or a signed amount) — nothing is assumed.
 * Once a real sample is provided, tighten `aliases` here to match its exact columns.
 */
export const salaamParser = createParser({
  source: 'SALAAM_BANK',
  label: 'Salaam Bank',
  defaultCurrency: 'USD',
  aliases: {
    transaction_id: ['transaction id', 'transactionid', 'txn id', 'transaction no', 'transaction number', 'id'],
    transaction_date: ['date', 'transaction date', 'posting date', 'value date', 'booking date', 'date time', 'datetime'],
    sender_name: ['sender name', 'sender', 'from name', 'remitter', 'remitter name', 'payer', 'payer name', 'from'],
    sender_phone: ['sender phone', 'sender number', 'sender account', 'remitter account', 'payer account', 'from account', 'from phone'],
    receiver_name: ['receiver name', 'receiver', 'beneficiary', 'beneficiary name', 'payee', 'payee name', 'to name', 'to'],
    receiver_phone: ['receiver phone', 'receiver number', 'receiver account', 'beneficiary account', 'payee account', 'to account', 'to phone'],
    counterparty_name: ['counterparty name', 'counterparty', 'other party', 'customer name', 'account name', 'name'],
    counterparty_phone: ['counterparty phone', 'counterparty account', 'customer phone', 'phone', 'phone number', 'mobile'],
    amount: ['amount', 'transaction amount', 'value'],
    debit: ['debit', 'debit amount', 'dr', 'withdrawal', 'withdrawals'],
    credit: ['credit', 'credit amount', 'cr', 'deposit', 'deposits'],
    direction: ['type', 'transaction type', 'direction', 'dr cr', 'dr/cr'],
    currency: ['currency', 'ccy'],
    description: ['description', 'details', 'narration', 'narrative', 'remarks', 'particulars'],
    reference_number: ['reference', 'reference number', 'ref', 'ref no', 'cheque no', 'reference no'],
  },
});
