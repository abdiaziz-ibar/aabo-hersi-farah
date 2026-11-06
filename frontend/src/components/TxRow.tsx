import { ArrowDown, ArrowUp } from 'lucide-react';
import React from 'react';
import { fmtDate, HIDDEN, money } from '../lib/format';
import { Transaction } from '../lib/types';
import { useLang } from '../i18n';
import { useStore } from '../store';

export function TxRow({ tx, hidden }: { tx: Transaction; hidden?: boolean }) {
  const { accountName } = useStore();
  const { place } = useLang();
  const income = tx.type === 'income';
  return (
    <div className="tx">
      <div className={`tx-icon ${income ? 'inc' : 'exp'}`}>
        {income ? <ArrowDown size={18} /> : <ArrowUp size={18} />}
      </div>
      <div className="tx-main">
        <div className="tx-party">{tx.party}</div>
        <div className="muted small">
          {accountName(tx.accountId)} · {place(tx.place)}{tx.methodName ? ` · ${tx.methodName}` : ''} · {fmtDate(tx.date)}
        </div>
      </div>
      <div className={`tx-amount ${income ? 'inc' : 'exp'}`}>
        {hidden ? HIDDEN : `${income ? '+' : '-'}${money(tx.amount)}`}
      </div>
    </div>
  );
}
