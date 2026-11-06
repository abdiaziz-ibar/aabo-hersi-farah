import { LogOut } from 'lucide-react';
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { PageHeader } from '../components/PageHeader';
import { LangToggle, useLang } from '../i18n';
import { useStore } from '../store';

export default function Settings() {
  const { loadSample, clearAll, dark, toggleTheme, hideBalances, toggleHide } = useStore();
  const { t } = useLang();
  const { user, isAdmin, logout, changePassword } = useAuth();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [toolMsg, setToolMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const submitPw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) return setPwMsg({ ok: false, text: t('Password-ada isma mid ahan') });
    setBusy(true);
    try {
      await changePassword(current, next);
      setCurrent(''); setNext(''); setConfirm('');
      setPwMsg({ ok: true, text: t('Password-ka waa la beddelay') });
    } catch (ex) {
      setPwMsg({ ok: false, text: ex instanceof Error ? ex.message : t('Cillad') });
    } finally {
      setBusy(false);
    }
  };

  const tool = async (fn: () => Promise<void>, ok: string) => {
    try {
      await fn();
      setToolMsg({ ok: true, text: ok });
    } catch (e) {
      setToolMsg({ ok: false, text: e instanceof Error ? e.message : t('Cillad') });
    }
  };

  return (
    <div className="page narrow">
      <PageHeader title={t('Dejin')} subtitle={t('Xisaabtaada iyo doorashooyinka')} hideAdd />

      <div className="stack">
        <div className="card">
          <div className="card-head">
            <div>
              <h3>{user?.fullName || user?.username}</h3>
              <p className="muted small">@{user?.username} · {isAdmin ? 'Maamule (Admin)' : 'Shaqaale'}</p>
            </div>
            <button className="btn" onClick={logout}><LogOut size={16} /> {t('Ka bax')}</button>
          </div>
          {isAdmin && (
            <div className="row-gap">
              <Link to="/accounts" className="link">{t('Maamul xisaabaha →')}</Link>
              <Link to="/methods" className="link">{t('Habka lacag-bixinta')} →</Link>
              <Link to="/users" className="link">{t('Maamul isticmaalayaasha →')}</Link>
            </div>
          )}
        </div>

        <div className="card">
          <h3 className="mb">{t('Muuqaalka')}</h3>
          <div className="switch-row">
            <span>{t('Luuqadda')}</span>
            <LangToggle />
          </div>
          <label className="switch-row">
            <span>{t('Muuqaalka madow (Dark mode)')}</span>
            <input type="checkbox" checked={dark} onChange={toggleTheme} />
          </label>
          <label className="switch-row">
            <span>{t('Qari lacagaha Dashboard-ka')}</span>
            <input type="checkbox" checked={hideBalances} onChange={toggleHide} />
          </label>
        </div>

        <form className="card form" onSubmit={submitPw}>
          <h3>{t('Beddel password-ka')}</h3>
          <label className="field">
            <span>{t('Password-ka hadda')}</span>
            <input className="input" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
          </label>
          <div className="form-row">
            <label className="field">
              <span>{t('Password cusub')}</span>
              <input className="input" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={8} required />
            </label>
            <label className="field">
              <span>{t('Ku celi')}</span>
              <input className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
            </label>
          </div>
          {pwMsg && <div className={`alert ${pwMsg.ok ? 'success' : 'danger'}`}>{pwMsg.text}</div>}
          <div><button className="btn primary" disabled={busy || !current || next.length < 8}>{t('Kaydi password-ka')}</button></div>
        </form>

        {isAdmin && (
          <div className="card danger-zone">
            <h3 className="mb">{t('Xogta (Admin)')}</h3>
            <p className="muted small mb">{t('Qalabkan waxaa loogu talagalay tijaabo. Waxay saameeyaan xogta dhammaan isticmaalayaasha.')}</p>
            <div className="row-gap">
              <button className="btn" onClick={() => tool(loadSample, t('Xogta tijaabada waa la geliyey'))}>{t('Soo geli xog tijaabo')}</button>
              <button className="btn danger" onClick={() => {
                if (window.confirm(t('Dhammaan dhaqdhaqaaqa waa la tirtiri doonaa. Sii wad?'))) void tool(clearAll, t('Dhammaan waa la tirtiray'));
              }}>{t('Tirtir dhammaan dhaqdhaqaaqa')}</button>
            </div>
            {toolMsg && <div className={`alert ${toolMsg.ok ? 'success' : 'danger'}`} style={{ marginTop: 12 }}>{toolMsg.text}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
