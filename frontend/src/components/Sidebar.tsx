import { BarChart3, Clock, FileUp, LayoutGrid, Lock, LogOut, Moon, Search, Settings, Sun, Smartphone, Users, Wallet } from 'lucide-react';
import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth';
import { LangToggle, useLang } from '../i18n';
import { useStore } from '../store';
import { Logo } from './Logo';

/** Desktop navigation (hidden on small screens, where the bottom TabBar is used). */
export function Sidebar() {
  const { user, isAdmin, logout } = useAuth();
  const { dark, toggleTheme } = useStore();
  const { t } = useLang();

  const link = (to: string, label: string, Icon: typeof Clock) => (
    <NavLink to={to} end={to === '/'} className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`}>
      <Icon size={19} /> {label}
    </NavLink>
  );

  return (
    <aside className="sidebar">
      <div className="brand"><Logo /> Hersi Farah</div>


      <nav className="side-nav">
        <div className="side-group">{t('Guud ahaan')}</div>
        {link('/', t('Dashboard'), LayoutGrid)}
        {link('/history', t('Taariikh'), Clock)}
        {link('/close', t('Xisaab xir'), Lock)}
        {isAdmin && <div className="side-group">Transactions</div>}
        {isAdmin && link('/fin/import', 'CSV Import', FileUp)}
        {isAdmin && link('/fin/search', 'Transaction Search', Search)}
        {isAdmin && link('/fin/reports', 'Transaction Reports', BarChart3)}
        <div className="side-group">{t('Maamul')}</div>
        {isAdmin && link('/accounts', t('Xisaabaha'), Wallet)}
        {isAdmin && link('/methods', t('Habka lacag-bixinta'), Smartphone)}
        {isAdmin && link('/users', t('Isticmaalayaasha'), Users)}
        {link('/settings', t('Dejin'), Settings)}
      </nav>

      <LangToggle className="side-lang" />
      <div className="side-user">
        <div className="avatar">{(user?.fullName || user?.username || '?').slice(0, 1).toUpperCase()}</div>
        <div className="side-user-info">
          <strong>{user?.fullName || user?.username}</strong>
          <span className="muted small">{isAdmin ? t('Maamule (Admin)') : t('Shaqaale')}</span>
        </div>
        <button className="icon-btn ghost" aria-label={t('Beddel muuqaalka')} title={t('Beddel muuqaalka')} onClick={toggleTheme}>
          {dark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <button className="icon-btn ghost" aria-label={t('Ka bax')} title={t('Ka bax')} onClick={logout}>
          <LogOut size={18} />
        </button>
      </div>
    </aside>
  );
}
