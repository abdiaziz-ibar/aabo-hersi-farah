import { BarChart3, Clock, Eye, EyeOff, Lock, LockKeyhole, PieChart, User, Wallet } from 'lucide-react';
import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { Logo } from '../components/Logo';
import { LangToggle, useLang } from '../i18n';

const features = [
  { icon: Wallet, text: 'Hadhaagga xisaabaha' },
  { icon: BarChart3, text: 'Soo gal iyo bixid' },
  { icon: PieChart, text: 'Bixidda halka ay aaday' },
  { icon: Clock, text: 'Taariikhda dhaqdhaqaaqa' },
];

export default function Login() {
  const { t } = useLang();
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await login(username.trim(), password, remember);
      nav('/', { replace: true });
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : t('Cillad aan la aqoon'));
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <aside className="login-brand">
        <LangToggle className="on-dark" />
        <div className="brand"><Logo mono /> Hersi Farah</div>
        <span className="badge-pill">{t('XISAABTA SHAKHSIGA IYO XAAFADDA')}</span>
        <h2>{t('Lacagtaada,')}<br />{t('si fudud u maamul.')}</h2>
        <div className="features">
          {features.map(({ icon: Icon, text }) => (
            <div key={text} className="feature">
              <span><Icon size={18} /></span>
              {t(text)}
            </div>
          ))}
        </div>
      </aside>

      <main className="login-form-wrap">
        <form className="login-form" onSubmit={submit}>
          <div className="brand dark"><Logo /> Hersi Farah</div>
          <LangToggle className="login-lang" />
          <h1>{t('Ku Soo Dhawoow')}</h1>
          <p className="muted">{t('Gal xisaabtaada si aad u sii wadato.')}</p>

          <label className="field">
            <span>Username</span>
            <div className="input-wrap">
              <User size={18} />
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t('Geli username-kaaga')}
                autoComplete="username"
                autoFocus
                required
              />
            </div>
          </label>

          <label className="field">
            <span>Password</span>
            <div className="input-wrap">
              <Lock size={18} />
              <input
                type={show ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('Geli password-kaaga')}
                autoComplete="current-password"
                required
              />
              <button type="button" className="eye" aria-label={show ? t('Qari password') : t('Tus password')} onClick={() => setShow((s) => !s)}>
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>

          <label className="check">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            {t('I xasuuso (Remember Me)')}
          </label>

          {error && <div className="login-error" role="alert">{error}</div>}

          <button className="btn primary login-btn" disabled={busy || !username.trim() || !password}>
            <LockKeyhole size={18} /> {busy ? t('Waa la galayaa…') : t('Soo Gal (Log In)')}
          </button>
          <p className="muted small center-text">© {new Date().getFullYear()} Hersi Farah</p>
        </form>
      </main>
    </div>
  );
}
