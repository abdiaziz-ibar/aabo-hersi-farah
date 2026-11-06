import { Copy, KeyRound, Pencil, Plus, Shuffle, UserCheck, UserX } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { fmtLong } from '../lib/format';
import { useLang } from '../i18n';
import { UserRow } from '../lib/types';

function genPassword(len = 12): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => chars[n % chars.length]).join('');
}

export default function Users() {
  const { t } = useLang();
  const { user, isAdmin } = useAuth();
  const [rows, setRows] = useState<UserRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<UserRow | 'new' | null>(null);
  const [resetting, setResetting] = useState<UserRow | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await api.users());
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('Cillad'));
    }
  }, []);
  useEffect(() => { if (isAdmin) void load(); }, [isAdmin, load]);

  if (!isAdmin) return <Navigate to="/" replace />;

  const toggleActive = async (u: UserRow) => {
    if (!window.confirm(u.active ? t('Ma xidhaa xisaabta "{u}"?', { u: u.username }) : t('Ma furtaa xisaabta "{u}"?', { u: u.username }))) return;
    try {
      await api.updateUser(u.id, { active: !u.active });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('Cillad'));
    }
  };

  return (
    <div className="page">
      <PageHeader title={t('Isticmaalayaasha')} subtitle={t('{n} isticmaale', { n: rows.length })} hideAdd>
        <button className="btn primary" onClick={() => setEditing('new')}><Plus size={18} /> {t('Isticmaale cusub')}</button>
      </PageHeader>

      {err && <div className="alert danger">{err}</div>}

      <div className="card flush">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('Magaca')}</th>
                <th>Username</th>
                <th>{t('Doorka')}</th>
                <th className="hide-sm">{t('Xaalad')}</th>
                <th className="hide-sm">{t('La abuuray')}</th>
                <th aria-label={t('Ficillada')} />
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => {
                const me = u.id === user?.id;
                return (
                  <tr key={u.id} className={u.active ? '' : 'dim'}>
                    <td className="strong">{u.fullName || '—'} {me && <span className="badge muted">{t('Adiga')}</span>}</td>
                    <td>{u.username}</td>
                    <td><span className={`badge ${u.role === 'admin' ? 'info' : 'muted'}`}>{u.role === 'admin' ? t('Maamule') : t('Shaqaale')}</span></td>
                    <td className="hide-sm"><span className={`badge ${u.active ? 'ok' : 'exp'}`}>{u.active ? t('Shaqeynaya') : t('La xidhay')}</span></td>
                    <td className="hide-sm">{u.createdAt ? fmtLong(u.createdAt) : '—'}</td>
                    <td className="act">
                      <button className="icon-btn ghost" title={t('Wax ka beddel')} aria-label={t('Wax ka beddel')} onClick={() => setEditing(u)}><Pencil size={16} /></button>
                      <button className="icon-btn ghost" title={t('Password cusub')} aria-label={t('Password cusub')} onClick={() => setResetting(u)}><KeyRound size={16} /></button>
                      {!me && (
                        <button className="icon-btn ghost" title={u.active ? t('Xidh') : t('Fur')} aria-label={u.active ? t('Xidh') : t('Fur')} onClick={() => void toggleActive(u)}>
                          {u.active ? <UserX size={16} /> : <UserCheck size={16} />}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <UserDialog
          target={editing === 'new' ? null : editing}
          isSelf={editing !== 'new' && editing.id === user?.id}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await load(); }}
        />
      )}
      {resetting && <ResetDialog target={resetting} onClose={() => setResetting(null)} />}
    </div>
  );
}

function UserDialog({ target, isSelf, onClose, onSaved }: {
  target: UserRow | null; isSelf: boolean; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const { t } = useLang();
  const [username, setUsername] = useState(target?.username ?? '');
  const [fullName, setFullName] = useState(target?.fullName ?? '');
  const [role, setRole] = useState<'admin' | 'staff'>(target?.role ?? 'staff');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [shown, setShown] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      if (target) {
        await api.updateUser(target.id, { fullName, role });
        await onSaved();
      } else {
        await api.createUser({ username: username.trim(), fullName: fullName.trim(), password, role });
        setShown(password); // let the admin copy the password once
      }
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : t('Cillad'));
    } finally {
      setBusy(false);
    }
  };

  if (shown) {
    return (
      <Modal title={t('Isticmaale waa la sameeyey')} onClose={() => void onSaved()}
        footer={<button className="btn primary" onClick={() => void onSaved()}>{t('Waa hagaag')}</button>}>
        <p>{t('Siiso')} <b>{username}</b> {t('macluumaadkan. Password-ka mar dambe lama arki karo.')}</p>
        <PasswordBox value={shown} />
      </Modal>
    );
  }

  return (
    <Modal title={target ? t('Wax ka beddel isticmaale') : t('Isticmaale cusub')} onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>{t('Jooji')}</button>
          <button type="submit" form="user-form" className="btn primary" disabled={busy || (!target && (!username.trim() || password.length < 8))}>
            {busy ? t('Waa la kaydinayaa…') : t('Kaydi')}
          </button>
        </>
      }>
      <form id="user-form" className="form" onSubmit={submit}>
        <label className="field">
          <span>{t('Magaca oo buuxa')}</span>
          <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} autoFocus />
        </label>
        <label className="field">
          <span>Username</span>
          <input className="input" value={username} disabled={!!target} onChange={(e) => setUsername(e.target.value)}
            placeholder={t('tusaale: amina')} autoComplete="off" />
        </label>
        <label className="field">
          <span>{t('Doorka')}</span>
          <select className="input" value={role} disabled={isSelf} onChange={(e) => setRole(e.target.value as 'admin' | 'staff')}>
            <option value="staff">{t('Shaqaale — arki karo oo ku dari karo')}</option>
            <option value="admin">{t('Maamule — wax walba')}</option>
          </select>
        </label>
        {!target && (
          <label className="field">
            <span>{t('Password (ugu yaraan 8 xaraf)')}</span>
            <div className="pw-row">
              <input className="input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
              <button type="button" className="btn" onClick={() => setPassword(genPassword())}><Shuffle size={16} /> {t('Soo saar')}</button>
            </div>
          </label>
        )}
        {err && <div className="alert danger" role="alert">{err}</div>}
      </form>
    </Modal>
  );
}

function ResetDialog({ target, onClose }: { target: UserRow; onClose: () => void }) {
  const { t } = useLang();
  const [password, setPassword] = useState(genPassword());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api.resetPassword(target.id, password);
      setDone(true);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : t('Cillad'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={t('Password cusub — {u}', { u: target.username })} onClose={onClose}
      footer={done
        ? <button className="btn primary" onClick={onClose}>{t('Waa hagaag')}</button>
        : <>
            <button type="button" className="btn" onClick={onClose}>{t('Jooji')}</button>
            <button type="submit" form="reset-form" className="btn primary" disabled={busy || password.length < 8}>{t('Beddel password-ka')}</button>
          </>}>
      {done ? (
        <>
          <p>{t('Password-ka waa la beddelay.')} <b>{target.username}</b> {t('waa laga saaray meel kasta oo uu ku jiray; waa inuu mar kale galaa. Siiso password-kan:')}</p>
          <PasswordBox value={password} />
        </>
      ) : (
        <form id="reset-form" className="form" onSubmit={submit}>
          <label className="field">
            <span>{t('Password cusub (ugu yaraan 8 xaraf)')}</span>
            <div className="pw-row">
              <input className="input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" autoFocus />
              <button type="button" className="btn" onClick={() => setPassword(genPassword())}><Shuffle size={16} /> {t('Soo saar')}</button>
            </div>
          </label>
          {err && <div className="alert danger" role="alert">{err}</div>}
        </form>
      )}
    </Modal>
  );
}

function PasswordBox({ value }: { value: string }) {
  const { t } = useLang();
  const [copied, setCopied] = useState(false);
  return (
    <div className="pw-box">
      <code>{value}</code>
      <button className="btn" onClick={async () => {
        try { await navigator.clipboard.writeText(value); setCopied(true); } catch { /* clipboard blocked */ }
      }}>
        <Copy size={16} /> {copied ? t('Waa la koobiyeeyey') : t('Koobiyee')}
      </button>
    </div>
  );
}
