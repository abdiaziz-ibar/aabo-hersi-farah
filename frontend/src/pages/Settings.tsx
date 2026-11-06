import { LogOut } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { PageHeader } from '../components/PageHeader';
import { LangToggle, useLang } from '../i18n';
import { useStore } from '../store';

export default function Settings() {
  const { dark, toggleTheme, hideBalances, toggleHide } = useStore();
  const { t } = useLang();
  const { user, isAdmin, logout, changePassword } = useAuth();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [maxFails, setMaxFails] = useState(3);
  const [secMsg, setSecMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    if (isAdmin) api.security().then((s) => setMaxFails(s.maxFailedAttempts)).catch(() => {});
  }, [isAdmin]);
  const saveSecurity = async () => {
    try {
      const r = await api.setSecurity(maxFails);
      setMaxFails(r.maxFailedAttempts);
      setSecMsg({ ok: true, text: t('La kaydiyey') });
    } catch (e) {
      setSecMsg({ ok: false, text: e instanceof Error ? e.message : t('Cillad') });
    }
  };

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
          <div className="card">
            <h3 className="mb">{t('Amniga')}</h3>
            <label className="field">
              <span>{t('Isku-day khaldan oo la ogol yahay')}</span>
              <div className="pw-row">
                <input className="input" type="number" min={1} max={10} value={maxFails}
                  onChange={(e) => setMaxFails(Math.max(1, Math.min(10, Number(e.target.value) || 1)))} style={{ maxWidth: 120 }} />
                <button className="btn primary" onClick={() => void saveSecurity()}>{t('Kaydi')}</button>
              </div>
            </label>
            <p className="muted small" style={{ marginTop: 8 }}>
              {t('Marka isku-dayga khaldan uu ka badsado tiradan, xisaabta waa la xidhayaa. Maamuluhu wuxuu ka furi karaa bogga Isticmaalayaasha.')}
            </p>
            {secMsg && <div className={`alert ${secMsg.ok ? 'success' : 'danger'}`} style={{ marginTop: 10 }}>{secMsg.text}</div>}
          </div>
        )}

      </div>
    </div>
  );
}
