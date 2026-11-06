import { Copy, KeyRound, Lock, LockOpen, Pencil, Plus, Shuffle, UserCheck, UserX } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { fmtLong } from '../lib/format';
import { useLang } from '../i18n';
import { AuditEntry, BlockEntry, UserRow } from '../lib/types';

const BAD_EVENTS = new Set(['login_failed', 'login_failed_unknown', 'login_blocked_locked', 'login_blocked_unknown', 'name_blocked', 'ip_blocked', 'account_locked', 'all_transactions_deleted']);

function actionLabel(a: string, t: (s: string) => string): string {
  const map: Record<string, string> = {
    login_success: 'Gelitaan guuleystay',
    login_failed: 'Gelitaan fashilmay',
    login_failed_unknown: 'Gelitaan fashilmay (user aan jirin)',
    login_blocked_locked: 'Isku day xisaab xiran',
    login_blocked_unknown: 'Isku day username la xannibay',
    name_blocked: 'Username la xannibay (isku-day badan)',
    ip_blocked: 'Shabakad la xannibay (isku-day badan)',
    unblocked: 'Xannibaad la furay',
    account_locked: 'Xisaab la xidhay (isku-day badan)',
    account_unlocked: 'Xisaab la furay',
    password_reset: 'Password cusub (maamule)',
    password_changed: 'Password la beddelay',
    user_created: 'Isticmaale la sameeyey',
    user_updated: 'Isticmaale la beddelay',
    settings_changed: 'Dejin amni la beddelay',
    transaction_deleted: 'Dhaqdhaqaaq la tirtiray',
    all_transactions_deleted: 'Dhammaan dhaqdhaqaaqa la tirtiray',
    bulk_import: 'Xog tijaabo la geliyey',
    month_closed: 'Bil la xiray',
    month_reopened: 'Bil la dib u furay',
  };
  return map[a] ? t(map[a]) : a;
}

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
  const [log, setLog] = useState<AuditEntry[]>([]);
  const [blocks, setBlocks] = useState<BlockEntry[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<UserRow | 'new' | null>(null);
  const [resetting, setResetting] = useState<UserRow | null>(null);

  const load = useCallback(async () => {
    try {
      const [u, a, b] = await Promise.all([api.users(), api.audit(40), api.blocks()]);
      setRows(u);
      setLog(a);
      setBlocks(b);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('Cillad'));
    }
  }, []);
  useEffect(() => {
    if (!isAdmin) return;
    void load();
    // keep the list fresh so a newly locked user shows up (with its Unlock button) within seconds
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [isAdmin, load]);

  if (!isAdmin) return <Navigate to="/" replace />;

  const unlock = async (u: UserRow) => {
    if (u.locked && !window.confirm(t('Ma furtaa xiritaanka xisaabta "{u}"?', { u: u.username }))) return;
    try {
      await api.unlockUser(u.id);
      setNotice(u.locked ? t('Xisaabta "{u}" waa la furay', { u: u.username }) : t('Isku-dayada khaldan ee "{u}" waa la nadiifiyey', { u: u.username }));
      setTimeout(() => setNotice(null), 4000);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('Cillad'));
    }
  };

  const unblock = async (b: BlockEntry) => {
    try {
      await api.unblock(b.kind, b.key);
      setNotice(t('"{k}" waa la furay', { k: b.key }));
      setTimeout(() => setNotice(null), 4000);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('Cillad'));
    }
  };

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
      {notice && <div className="alert success">{notice}</div>}

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
                    <td className="hide-sm">
                      {u.locked ? (
                        <span className="badge exp"><Lock size={12} /> {t('Xiran (isku-day khaldan)')}</span>
                      ) : (
                        <span className={`badge ${u.active ? 'ok' : 'exp'}`}>{u.active ? t('Shaqeynaya') : t('La xidhay')}</span>
                      )}
                      {!u.locked && (u.failedAttempts ?? 0) > 0 && (
                        <div className="muted small">{t('{n} isku-day khaldan', { n: u.failedAttempts ?? 0 })}</div>
                      )}
                    </td>
                    <td className="hide-sm">{u.createdAt ? fmtLong(u.createdAt) : '—'}</td>
                    <td className="act">
                      {/* Always available: unlocks a locked user, or clears wrong-attempt counts */}
                      {u.locked ? (
                        <button className="btn small-btn primary" onClick={() => void unlock(u)}>
                          <LockOpen size={14} /> {t('Fur xiritaanka')}
                        </button>
                      ) : (
                        <button className="icon-btn ghost" title={t('Fur xiritaanka / nadiifi isku-dayada')} aria-label={t('Fur xiritaanka / nadiifi isku-dayada')} onClick={() => void unlock(u)}>
                          <LockOpen size={16} />
                        </button>
                      )}
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

      {blocks.length > 0 && (
        <div className="card flush blocks-card">
          <div className="card-head pad">
            <div>
              <h3>{t('Isku-dayo la xannibay')}</h3>
              <p className="muted small">{t('Dad aan isticmaale ahayn ama shabakado la xannibay sababtoo ah isku-day khaldan oo badan.')}</p>
            </div>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('Nooca')}</th>
                  <th>{t('Magaca / IP')}</th>
                  <th className="num">{t('Isku-day')}</th>
                  <th className="hide-sm">{t('Waqtiga')}</th>
                  <th aria-label={t('Ficillada')} />
                </tr>
              </thead>
              <tbody>
                {blocks.map((b) => (
                  <tr key={`${b.kind}:${b.key}`}>
                    <td>
                      <span className="badge exp">{b.kind === 'name' ? t('Username (ma ahan isticmaale)') : t('Shabakad (IP)')}</span>
                      {b.expiresInMinutes && <div className="muted small">{t('Wuu dhammaanayaa {n} daqiiqo kadib', { n: b.expiresInMinutes })}</div>}
                    </td>
                    <td className="strong">{b.key}</td>
                    <td className="num">{b.failed}</td>
                    <td className="hide-sm nowrap">{new Date(b.blockedAt).toLocaleString()}</td>
                    <td className="act">
                      <button className="btn small-btn primary" onClick={() => void unblock(b)}><LockOpen size={14} /> {t('Fur')}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card flush">
        <div className="card-head pad"><h3>{t('Dhacdooyinka amniga')}</h3></div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('Waqtiga')}</th>
                <th>{t('Qofka')}</th>
                <th>{t('Dhacdada')}</th>
                <th className="hide-sm">IP</th>
              </tr>
            </thead>
            <tbody>
              {log.map((e) => (
                <tr key={e.id}>
                  <td className="nowrap">{new Date(e.at).toLocaleString()}</td>
                  <td>{e.actor || '—'}</td>
                  <td>
                    <span className={`badge ${BAD_EVENTS.has(e.action) ? 'exp' : 'muted'}`}>{actionLabel(e.action, t)}</span>
                    {(e.target || e.detail) && <div className="muted small">{[e.target, e.detail].filter(Boolean).join(' · ')}</div>}
                  </td>
                  <td className="hide-sm muted small">{e.ip}</td>
                </tr>
              ))}
              {log.length === 0 && <tr><td colSpan={4} className="empty-row">—</td></tr>}
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
