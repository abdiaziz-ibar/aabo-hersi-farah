import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { useLang } from '../i18n';
import { PaymentMethod, SavedNumber } from '../lib/types';
import { useStore } from '../store';

export default function Methods() {
  const { isAdmin } = useAuth();
  const { t } = useLang();
  const { methods, transactions, refresh } = useStore();
  const [editing, setEditing] = useState<PaymentMethod | 'new' | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const tx of transactions) if (tx.methodId) m.set(tx.methodId, (m.get(tx.methodId) ?? 0) + 1);
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

  const toggle = (m: PaymentMethod) => {
    if (m.active && !window.confirm(t('Ma xidhaa habka "{n}"? Dhaqdhaqaaqa cusub looma dooran karo.', { n: m.name }))) return;
    void run(() => api.updateMethod(m.id, { active: !m.active }));
  };
  const del = (m: PaymentMethod) => {
    if (window.confirm(t('Ma tirtirtaa habka "{n}"?', { n: m.name }))) void run(() => api.deleteMethod(m.id));
  };

  return (
    <div className="page">
      <PageHeader title={t('Habka lacag-bixinta')} subtitle={t('EVC, Salaam, Dahabshiil iyo kuwa kale')} hideAdd>
        <button className="btn primary" onClick={() => setEditing('new')}><Plus size={18} /> {t('Habka cusub')}</button>
      </PageHeader>

      {err && <div className="alert danger">{err}</div>}

      <div className="card flush">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('Habka')}</th>
                <th>{t('Nooca lambarka')}</th>
                <th className="hide-sm">{t('Lambarada')}</th>
                <th className="num hide-sm">{t('Dhaqdhaqaaq')}</th>
                <th>{t('Xaalad')}</th>
                <th aria-label={t('Ficillada')} />
              </tr>
            </thead>
            <tbody>
              {methods.map((m) => {
                const count = counts.get(m.id) ?? 0;
                return (
                  <tr key={m.id} className={m.active ? '' : 'dim'}>
                    <td className="strong">{m.name}</td>
                    <td>{m.kind === 'phone' ? t('Lambarka telefoonka') : t('Lambarka akoonka')}</td>
                    <td className="hide-sm">
                      <div className="chips-row">
                        {m.numbers.slice(0, 3).map((n) => <span key={n.id} className="badge muted">{n.number}</span>)}
                        {m.numbers.length > 3 && <span className="muted small">{t('+{n} kale', { n: m.numbers.length - 3 })}</span>}
                        {m.numbers.length === 0 && <span className="muted small">—</span>}
                      </div>
                    </td>
                    <td className="num hide-sm">{count}</td>
                    <td><span className={`badge ${m.active ? 'ok' : 'muted'}`}>{m.active ? t('Shaqeynaysa') : t('Xidhan')}</span></td>
                    <td className="act">
                      <button className="icon-btn ghost" title={t('Wax ka beddel')} aria-label={t('Wax ka beddel')} onClick={() => setEditing(m)}><Pencil size={16} /></button>
                      <button className="icon-btn ghost" title={m.active ? t('Xidh xisaabta') : t('Dib u fur')} aria-label={m.active ? t('Xidh xisaabta') : t('Dib u fur')} onClick={() => toggle(m)}>
                        {m.active ? <Archive size={16} /> : <ArchiveRestore size={16} />}
                      </button>
                      {count === 0 && (
                        <button className="icon-btn ghost" title={t('Tirtir')} aria-label={t('Tirtir')} onClick={() => del(m)}><Trash2 size={16} /></button>
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
        {t('Habka waxaa loo isticmaalaa marka lacag la helo ama la bixiyo, waxaana la diiwaangeliyaa lambarka telefoonka ama akoonka. Ku xidh haddii aadan u baahnayn.')}
      </p>

      {editing && (
        <MethodDialog
          target={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async (created) => {
            await refresh();
            // a brand-new method opens straight away so its numbers can be added
            setEditing(created ? { ...created, numbers: created.numbers ?? [] } : null);
          }}
        />
      )}
    </div>
  );
}

function MethodDialog({ target, onClose, onSaved }: {
  target: PaymentMethod | null;
  onClose: () => void;
  onSaved: (created?: Omit<PaymentMethod, 'numbers'> & { numbers?: SavedNumber[] }) => Promise<void>;
}) {
  const { t } = useLang();
  const { methods, refresh } = useStore();
  const live = target ? methods.find((m) => m.id === target.id) ?? target : null; // always the latest numbers
  const [newNum, setNewNum] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [numBusy, setNumBusy] = useState(false);
  const [name, setName] = useState(target?.name ?? '');
  const [kind, setKind] = useState<PaymentMethod['kind']>(target?.kind ?? 'phone');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      if (target) {
        await api.updateMethod(target.id, { name: name.trim(), kind });
        await onSaved();
      } else {
        await onSaved(await api.createMethod({ name: name.trim(), kind }));
      }
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : t('Cillad'));
      setBusy(false);
    }
  };

  const addNumber = async () => {
    if (!live || newNum.trim().length < 3) return;
    setNumBusy(true);
    setErr(null);
    try {
      await api.addMethodNumber(live.id, { number: newNum.trim(), label: newLabel.trim() });
      setNewNum('');
      setNewLabel('');
      await refresh();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : t('Cillad'));
    } finally {
      setNumBusy(false);
    }
  };
  const removeNumber = async (n: SavedNumber) => {
    if (!live || !window.confirm(t('Tirtir lambarka "{n}"?', { n: n.number }))) return;
    setErr(null);
    try {
      await api.deleteMethodNumber(live.id, n.id);
      await refresh();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : t('Cillad'));
    }
  };

  return (
    <Modal
      title={target ? t('Beddel habka') : t('Habka cusub')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>{t('Jooji')}</button>
          <button type="submit" form="method-form" className="btn primary" disabled={busy || name.trim().length < 2}>
            {busy ? t('Waa la kaydinayaa…') : t('Kaydi')}
          </button>
        </>
      }
    >
      <form id="method-form" className="form" onSubmit={submit}>
        <label className="field">
          <span>{t('Magaca habka')}</span>
          <input className="input" value={name} maxLength={40} placeholder="EVC Plus, Salaam, Edahab…" onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <label className="field">
          <span>{t('Nooca lambarka')}</span>
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value as PaymentMethod['kind'])}>
            <option value="phone">{t('Lambarka telefoonka')} (EVC, Edahab…)</option>
            <option value="account">{t('Lambarka akoonka')} ({t('bangi')}, Salaam…)</option>
          </select>
        </label>
        {err && <div className="alert danger" role="alert">{err}</div>}
      </form>

      {live && (
        <div className="numbers-box">
          <h4>{t('Lambarada la kaydiyey')}</h4>
          <ul className="num-list">
            {live.numbers.map((n) => (
              <li key={n.id}>
                <span><b>{n.number}</b>{n.label && <em className="muted"> — {n.label}</em>}</span>
                <button type="button" className="icon-btn ghost" aria-label={t('Tirtir')} title={t('Tirtir')} onClick={() => void removeNumber(n)}>
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
            {live.numbers.length === 0 && <li className="muted small">{t('Weli lambar lama kaydin')}</li>}
          </ul>
          <div className="num-add" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void addNumber(); } }}>
            <input className="input" value={newNum} inputMode={live.kind === 'phone' ? 'tel' : 'text'}
              placeholder={live.kind === 'phone' ? t('tusaale: 615595050') : t('tusaale: lambarka akoonka')}
              onChange={(e) => setNewNum(e.target.value)} />
            <input className="input" value={newLabel} maxLength={40} placeholder={t('Magac (ikhtiyaari)')} onChange={(e) => setNewLabel(e.target.value)} />
            <button type="button" className="btn" disabled={numBusy || newNum.trim().length < 3} onClick={() => void addNumber()}>
              <Plus size={16} /> {t('Ku dar lambar')}
            </button>
          </div>
          <p className="muted small">{t('Lambarada ayaa lagu dooran karaa marka dhaqdhaqaaq la darayo.')}</p>
        </div>
      )}
    </Modal>
  );
}
