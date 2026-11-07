import React from 'react';
import { Link } from 'react-router-dom';
import { FinTx, fmtDateTime, fmtMoney, partyKey, prettyPhone } from '../../lib/finApi';
import { SortTh, SourceChip, TypeChip } from './parts';

function Party({ name, phone }: { name: string | null; phone: string | null }) {
  const key = partyKey(phone, name);
  return key ? <Link className="link" to={`/fin/customer/${encodeURIComponent(key)}`}>{name || prettyPhone(phone)}</Link> : <span className="muted">—</span>;
}

/** The full transaction table: sortable headers, clickable people, type/source badges. */
export function TxTable({ rows, sort, dir, onSort }: { rows: FinTx[]; sort: string; dir: string; onSort: (k: string) => void }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <SortTh label="Date" k="date" sort={sort} dir={dir} onSort={onSort} />
            <SortTh label="Transaction ID" k="id" sort={sort} dir={dir} onSort={onSort} />
            <SortTh label="Sender" k="sender" sort={sort} dir={dir} onSort={onSort} />
            <th>Sender phone</th>
            <SortTh label="Receiver" k="receiver" sort={sort} dir={dir} onSort={onSort} />
            <th>Receiver phone</th>
            <SortTh label="Type" k="type" sort={sort} dir={dir} onSort={onSort} />
            <SortTh label="Amount" k="amount" sort={sort} dir={dir} onSort={onSort} num />
            <th>Cur.</th>
            <SortTh label="Source" k="source" sort={sort} dir={dir} onSort={onSort} />
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id}>
              <td className="nowrap">{fmtDateTime(t.transaction_date)}</td>
              <td className="mono">{t.transaction_id ?? <span className="muted">—</span>}</td>
              <td><Party name={t.sender_name} phone={t.sender_phone} /></td>
              <td className="nowrap mono">{prettyPhone(t.sender_phone)}</td>
              <td><Party name={t.receiver_name} phone={t.receiver_phone} /></td>
              <td className="nowrap mono">{prettyPhone(t.receiver_phone)}</td>
              <td><TypeChip type={t.transaction_type} /></td>
              <td className={`num strong ${t.transaction_type === 'RECEIVED' ? 'inc-c' : t.transaction_type === 'SENT' ? 'exp-c' : ''}`}>{fmtMoney(t.amount, '').trim()}</td>
              <td>{t.currency}</td>
              <td><SourceChip source={t.source} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
