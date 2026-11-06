import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { ACCOUNT_ICONS, iconFor } from '../lib/icons';
import { money } from '../lib/format';
import { useLang } from '../i18n';
import { Account } from '../lib/types';
import { useStore } from '../store';

export default function Accounts() {
  const { t } = useLang();
  const { isAdmin } = useAuth();
  const { accounts, transactions, refresh } = useStore();
  const [editing, setEditing] = useState<Account | 'new' | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const stats = useMemo(() => {
    const m = new Map<string, { balance: number; count: number }>();
    for (const t of transactions) {
      const s = m.get(t.accountId) ?? { balance: 0, count: 0 };
      s.balance += t.type === 'income' ? t.amount : -t.amount;
      s.count += 1;
      m.set(t.accountId, s);
    }
    return m;
  }, [transactions]);

  if (!isAdmin) return <Navigate to="/" replace />;

  const run = async (fn: () => Promise<unknown>) => {
    setErr(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('Cillad'));
    }
  };

  const toggle = (a: Account) => {
    if (a.active && !window.confirm(t('Ma xidhaa xisaabta "{n}"? Waxay ka libdhi doontaa liiska lagu darayo dhaqdhaqaaqa.', { n: a.name }))) return;
    void run(() => api.updateAccount(a.id, { active: !a.active }));
  };
  const del = (a: Account) => {
    if (window.confirm(t('Ma tirtirtaa xisaabta "{n}"?', { n: a.name }))) void run(() => api.deleteAccount(a.id));
  };

  return (
    <div className="page">
      <PageHeader title={t('Xisaabaha')} subtitle={t('Abuur xisaab cusub ama magaca ka beddel')} hideAdd>
        <button className="btn primary" onClick={() => setEditing('new')}><Plus size={18} /> {t('Xisaab cusub')}</button>
      </PageHeader>

      {err && <div className="alert danger">{err}</div>}

      <div className="card flush">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('Xisaab')}</th>
                <th className="num">{t('Hadhaagga')}</th>
                <th className="num hide-sm">{t('Dhaqdhaqaaq')}</th>
                <th>{t('Xaalad')}</th>
                <th aria-label={t('Ficillada')} />
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => {
                const s = stats.get(a.id) ?? { balance: 0, count: 0 };
                const Icon = iconFor(a.icon);
                return (
                  <tr key={a.id} className={a.active ? '' : 'dim'}>
                    <td>
                      <span className="cell-icon">
                        <span className="account-icon sm"><Icon size={17} /></span>
                        <span className="strong">{a.name}</span>
                      </span>
                    </td>
                    <td className="num strong">{money(s.balance)}</td>
                    <td className="num hide-sm">{s.count}</td>
                    <td><span className={`badge ${a.active ? 'ok' : 'muted'}`}>{a.active ? t('Shaqeynaysa') : t('Xidhan')}</span></td>
                    <td className="act">
                      <button className="icon-btn ghost" title={t('Wax ka beddel')} aria-label={t('Wax ka beddel')} onClick={() => setEditing(a)}><Pencil size={16} /></button>
                      <button className="icon-btn ghost" title={a.active ? t('Xidh xisaabta') : t('Dib u fur')} aria-label={a.active ? t('Xidh xisaabta') : t('Dib u fur')} onClick={() => toggle(a)}>
                        {a.active ? <Archive size={16} /> : <ArchiveRestore size={16} />}
                      </button>
                      {s.count === 0 && (
                        <button className="icon-btn ghost" title={t('Tirtir')} aria-label={t('Tirtir')} onClick={() => del(a)}><Trash2 size={16} /></button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="muted small">
        {t('Magaca xisaabta waad beddeli kartaa wakhti kasta; dhaqdhaqaaqii hore wuu ku hadhayaa. Xisaab hadhaag leh lama xidhi karo.')}
      </p>

      {editing && (
        <AccountDialog
          target={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await refresh(); }}
        />
      )}
    </div>
  );
}

function AccountDialog({ target, onClose, onSaved }: { target: Account | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const { t } = useLang();
  const [name, setName] = useState(target?.name ?? '');
  const [icon, setIcon] = useState(target?.icon ?? 'wallet');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      if (target) await api.updateAccount(target.id, { name: name.trim(), icon });
      else await api.createAccount({ name: name.trim(), icon });
      await onSaved();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : t('Cillad'));
      setBusy(false);
    }
  };

  return (
    <Modal
      title={target ? t('Beddel xisaabta') : t('Xisaab cusub')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>{t('Jooji')}</button>
          <button type="submit" form="account-form" className="btn primary" disabled={busy || name.trim().length < 2}>
            {busy ? t('Waa la kaydinayaa…') : t('Kaydi')}
          </button>
        </>
      }
    >
      <form id="account-form" className="form" onSubmit={submit}>
        <label className="field">
          <span>{t('Magaca xisaabta')}</span>
          <input className="input" value={name} maxLength={40} placeholder={t('tusaale: Bangiga, Kaydka, Mashruuc')} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <div className="field">
          <span>{t('Astaanta')}</span>
          <div className="icon-grid">
            {Object.keys(ACCOUNT_ICONS).map((k) => {
              const Icon = ACCOUNT_ICONS[k];
              return (
                <button key={k} type="button" className={`icon-opt ${icon === k ? 'on' : ''}`} aria-label={k} aria-pressed={icon === k} onClick={() => setIcon(k)}>
                  <Icon size={20} />
                </button>
              );
            })}
          </div>
        </div>
        {err && <div className="alert danger" role="alert">{err}</div>}
      </form>
    </Modal>
  );
}
