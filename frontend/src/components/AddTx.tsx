import React, { createContext, useContext, useMemo, useState } from 'react';
import { inputToIso, todayInput } from '../lib/format';
import { AccountId, TxType } from '../lib/types';
import { useLang } from '../i18n';
import { useStore } from '../store';
import { Modal } from './Modal';

const Ctx = createContext<{ open: () => void }>({ open: () => {} });
export const useAddTx = () => useContext(Ctx);

/** Provides `open()` anywhere in the app and renders the "Ku dar" dialog. */
export function AddTxProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const value = useMemo(() => ({ open: () => setOpen(true) }), []);
  return (
    <Ctx.Provider value={value}>
      {children}
      {isOpen && <AddTxDialog onClose={() => setOpen(false)} />}
    </Ctx.Provider>
  );
}

function AddTxDialog({ onClose }: { onClose: () => void }) {
  const { add, transactions, activeAccounts, activeMethods } = useStore();
  const { t } = useLang();
  const [type, setType] = useState<TxType>('expense');
  const [amount, setAmount] = useState('');
  const [account, setAccount] = useState<AccountId>(activeAccounts[0]?.id ?? '');
  const [date, setDate] = useState(todayInput());
  const [party, setParty] = useState('');
  const [place, setPlace] = useState('');
  const [methodId, setMethodId] = useState('');
  const [methodNumber, setMethodNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const places = useMemo(() => [...new Set(transactions.map((t) => t.place))].slice(0, 30), [transactions]);
  const parties = useMemo(() => [...new Set(transactions.map((t) => t.party))].slice(0, 30), [transactions]);

  const method = activeMethods.find((m) => m.id === methodId);
  const saved = method?.numbers ?? [];
  // picking from the method's saved numbers, or typing a new one
  const [newNumber, setNewNumber] = useState(false);
  const pickMethod = (id: string) => {
    setMethodId(id);
    const m = activeMethods.find((x) => x.id === id);
    const list = m?.numbers ?? [];
    // default: the number used most recently with this method, else the first saved one
    const last = [...transactions]
      .sort((a, b) => +new Date(b.date) - +new Date(a.date))
      .find((tx) => tx.methodId === id && tx.methodNumber && list.some((n) => n.number === tx.methodNumber));
    setMethodNumber(last?.methodNumber ?? list[0]?.number ?? '');
    setNewNumber(list.length === 0);
  };
  const numberLabel = !method
    ? ''
    : type === 'income'
      ? method.kind === 'phone' ? t('Lambarka telefoonka ee lacagta ku dhacday') : t('Lambarka akoonka ee lacagta ku dhacday')
      : method.kind === 'phone' ? t('Lambarka telefoonka laga bixiyey') : t('Lambarka akoonka laga bixiyey');

  const value = parseFloat(amount.replace(',', '.'));
  const valid = Number.isFinite(value) && value > 0 && party.trim().length > 0 && !!date && !!account
    && (!methodId || methodNumber.trim().length >= 3);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    setErr(null);
    try {
      await add({ type, amount: value, accountId: account, party: party.trim(), place: place.trim() || 'Kale', date: inputToIso(date),
        methodId: methodId || null, methodNumber: methodId ? methodNumber.trim() : null });
      onClose();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : t('Cillad'));
      setSaving(false);
    }
  };

  return (
    <Modal
      title={t('Ku dar dhaqdhaqaaq')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>{t('Jooji')}</button>
          <button type="submit" form="add-tx" className="btn primary" disabled={!valid || saving}>
            {saving ? t('Waa la kaydinayaa…') : t('Kaydi')}
          </button>
        </>
      }
    >
      <form id="add-tx" className="form" onSubmit={submit}>
        <div className="segmented">
          <button type="button" className={type === 'income' ? 'on inc' : ''} onClick={() => setType('income')}>{t('Soo gashay')}</button>
          <button type="button" className={type === 'expense' ? 'on exp' : ''} onClick={() => setType('expense')}>{t('Baxday')}</button>
        </div>

        <div className="form-row">
          <label className="field">
            <span>{t('Lacagta ($)')}</span>
            <input className="input" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          </label>
          <label className="field">
            <span>{t('Taariikhda')}</span>
            <input className="input" type="date" value={date} max={todayInput()} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>

        <label className="field">
          <span>{t('Xisaabta')}</span>
          <select className="input" value={account} onChange={(e) => setAccount(e.target.value as AccountId)}>
            {activeAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>

        <label className="field">
          <span>{type === 'income' ? t('Kuka ka timid') : t('Kuka loo bixiyey')}</span>
          <input className="input" list="parties" placeholder={t('Magaca qofka / dhinaca')} value={party} onChange={(e) => setParty(e.target.value)} />
          <datalist id="parties">{parties.map((p) => <option key={p} value={p} />)}</datalist>
        </label>

        {activeMethods.length > 0 && (
          <>
            <label className="field">
              <span>{type === 'income' ? t('Lacagta ku soo gashay (EVC, Salaam…)') : t('Lacagta laga bixiyey (EVC, Salaam…)')} <em className="muted">({t('ikhtiyaari')})</em></span>
              <select className="input" value={methodId} onChange={(e) => pickMethod(e.target.value)}>
                <option value="">{t('Ma jiro')}</option>
                {activeMethods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>
            {method && (
              <div className="field">
                <span>{numberLabel}</span>
                {saved.length > 0 && (
                  <select
                    className="input"
                    value={newNumber ? '__new__' : methodNumber}
                    onChange={(e) => {
                      if (e.target.value === '__new__') { setNewNumber(true); setMethodNumber(''); }
                      else { setNewNumber(false); setMethodNumber(e.target.value); }
                    }}
                  >
                    {saved.map((n) => <option key={n.id} value={n.number}>{n.number}{n.label ? ` — ${n.label}` : ''}</option>)}
                    <option value="__new__">+ {t('Lambar cusub')}</option>
                  </select>
                )}
                {(newNumber || saved.length === 0) && (
                  <input className="input" inputMode={method.kind === 'phone' ? 'tel' : 'text'}
                    placeholder={method.kind === 'phone' ? t('tusaale: 615595050') : t('tusaale: lambarka akoonka')}
                    value={methodNumber} onChange={(e) => setMethodNumber(e.target.value)} />
                )}
              </div>
            )}
          </>
        )}

        <label className="field">
          <span>{t('Meesha')} <em className="muted">({t('ikhtiyaari')})</em></span>
          <input className="input" list="places" placeholder={t('Tusaale: Suuq, Guri, Gaadiid')} value={place} onChange={(e) => setPlace(e.target.value)} />
          <datalist id="places">{places.map((p) => <option key={p} value={p} />)}</datalist>
        </label>

        {err && <div className="alert danger" role="alert">{err}</div>}
      </form>
    </Modal>
  );
}
