import { Download, Search, Trash2 } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { PageHeader } from '../components/PageHeader';
import { fmtLong, money } from '../lib/format';
import { monthName, useLang } from '../i18n';
import { lastMonths } from '../lib/stats';
import { useStore } from '../store';

export default function History() {
  const { transactions, remove, accounts, accountName } = useStore();
  const { t: tr, place } = useLang();
  const { isAdmin } = useAuth();
  const [params, setParams] = useSearchParams();
  const account = accounts.find((a) => a.id === params.get('account'))?.id ?? '';
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [month, setMonth] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const now = new Date();
  const months = useMemo(() => lastMonths({ y: now.getFullYear(), m: now.getMonth() }, 12).reverse(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return transactions
      .filter((t) => !account || t.accountId === account)
      .filter((t) => !type || t.type === type)
      .filter((t) => {
        if (!month) return true;
        const d = new Date(t.date);
        return `${d.getFullYear()}-${d.getMonth()}` === month;
      })
      .filter((t) => !needle || `${t.party} ${t.place} ${accountName(t.accountId)}`.toLowerCase().includes(needle))
      .sort((a, b) => +new Date(b.date) - +new Date(a.date));
  }, [transactions, account, type, month, q, accountName]);

  const income = list.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = list.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  const exportCsv = () => {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = [
      [tr('Taariikh'), tr('Qofka / Dhinaca'), tr('Meesha'), tr('Xisaab'), tr('Nooca'), tr('Lacagta'), tr('Habka'), tr('Lambarka'), tr('Diiwaangeliyay')],
      ...list.map((t) => [
        t.date.slice(0, 10), t.party, place(t.place), accountName(t.accountId),
        t.type === 'income' ? tr('Soo gashay') : tr('Baxday'), t.amount, t.methodName ?? '', t.methodNumber ?? '', t.createdBy ?? '',
      ]),
    ];
    const blob = new Blob(['﻿' + rows.map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `taariikh-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const del = async (id: string) => {
    if (!window.confirm(tr('Ma tirtirtaa dhaqdhaqaaqan?'))) return;
    setErr(null);
    try {
      await remove(id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : tr('Cillad'));
    }
  };

  return (
    <div className="page">
      <PageHeader title={tr('Taariikh')} subtitle={tr('{n} dhaqdhaqaaq', { n: list.length })}>
        <button className="btn" onClick={exportCsv} disabled={!list.length}><Download size={16} /> CSV</button>
      </PageHeader>

      <div className="card flush">
        <div className="toolbar">
          <div className="search">
            <Search size={16} />
            <input placeholder={tr('Raadi qof, meel, xisaab…')} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className="input compact" value={account} onChange={(e) => setParams(e.target.value ? { account: e.target.value } : {})}>
            <option value="">{tr('Dhammaan xisaabaha')}</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.active ? '' : ` ${tr('(xiran)')}`}</option>)}
          </select>
          <select className="input compact" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">{tr('Dhammaan noocyada')}</option>
            <option value="income">{tr('Soo gashay')}</option>
            <option value="expense">{tr('Baxday')}</option>
          </select>
          <select className="input compact" value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="">{tr('Dhammaan bilaha')}</option>
            {months.map((x) => <option key={`${x.y}-${x.m}`} value={`${x.y}-${x.m}`}>{monthName(x.m)} {x.y}</option>)}
          </select>
        </div>

        {err && <div className="alert danger" style={{ margin: '0 16px 12px' }}>{err}</div>}

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{tr('Taariikh')}</th>
                <th>{tr('Qofka / Dhinaca')}</th>
                <th className="hide-sm">{tr('Meesha')}</th>
                <th className="hide-sm">{tr('Xisaab')}</th>
                <th className="hide-sm">{tr('Nooca')}</th>
                <th className="hide-sm">{tr('Habka')}</th>
                <th className="num">{tr('Lacagta')}</th>
                {isAdmin && <th aria-label={tr('Ficil')} />}
              </tr>
            </thead>
            <tbody>
              {list.map((t) => (
                <tr key={t.id}>
                  <td className="nowrap">{fmtLong(t.date)}</td>
                  <td>
                    <div className="strong">{t.party}</div>
                    {t.createdBy && <div className="muted small">{t.createdBy}</div>}
                  </td>
                  <td className="hide-sm">{place(t.place)}</td>
                  <td className="hide-sm">{accountName(t.accountId)}</td>
                  <td className="hide-sm">
                    <span className={`badge ${t.type === 'income' ? 'inc' : 'exp'}`}>{t.type === 'income' ? tr('Soo gashay') : tr('Baxday')}</span>
                  </td>
                  <td className="hide-sm">
                    {t.methodName ? (
                      <>
                        <div className="strong">{t.methodName}</div>
                        <div className="muted small">{t.methodNumber}</div>
                      </>
                    ) : '—'}
                  </td>
                  <td className={`num strong ${t.type === 'income' ? 'inc-c' : 'exp-c'}`}>
                    {t.type === 'income' ? '+' : '-'}{money(t.amount)}
                  </td>
                  {isAdmin && (
                    <td className="act">
                      <button className="icon-btn ghost" aria-label={tr('Tirtir')} title={tr('Tirtir')} onClick={() => void del(t.id)}>
                        <Trash2 size={16} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {list.length === 0 && (
                <tr><td colSpan={isAdmin ? 8 : 7} className="empty-row">{tr('Dhaqdhaqaaq lama helin.')}</td></tr>
              )}
            </tbody>
            {list.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={2}>{tr('Wadarta liiska')}</td>
                  <td className="hide-sm" colSpan={4} />
                  <td className="num">
                    <div className="inc-c">+{money(income)}</div>
                    <div className="exp-c">-{money(expense)}</div>
                  </td>
                  {isAdmin && <td />}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
