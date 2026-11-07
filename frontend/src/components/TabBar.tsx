import { ArrowLeftRight, Clock, LayoutGrid, Lock, Plus, Settings } from 'lucide-react';
import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth';
import { useLang } from '../i18n';
import { useAddTx } from './AddTx';

const left = [
  { to: '/', label: 'Guud', icon: LayoutGrid },
  { to: '/history', label: 'Taariikh', icon: Clock },
];
const right = [
  { to: '/close', label: 'Xisaab xir', icon: Lock },
  { to: '/settings', label: 'Dejin', icon: Settings },
];

/** Phone navigation: bottom bar with a raised "+" in the middle. */
export function TabBar() {
  const { open } = useAddTx();
  const { t } = useLang();
  const { isAdmin } = useAuth();
  const item = ({ to, label, icon: Icon }: (typeof left)[number]) => (
    <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>
      <Icon size={22} />
      <span>{t(label)}</span>
    </NavLink>
  );
  // Admins get one extra tab (Financial Transactions); an empty slot on the right keeps the "+" centred.
  return (
    <nav className="tabbar">
      {left.map(item)}
      {isAdmin && item({ to: '/fin/search', label: 'Transactions', icon: ArrowLeftRight })}
      <div className="tab" />
      {right.map(item)}
      {isAdmin && <div className="tab" />}
      <button className="fab" aria-label={t('Ku dar')} onClick={open}>
        <Plus size={30} color="#fff" />
      </button>
    </nav>
  );
}
