import { Clock, LayoutGrid, Lock, Plus, Settings } from 'lucide-react';
import React from 'react';
import { NavLink } from 'react-router-dom';
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
  const item = ({ to, label, icon: Icon }: (typeof left)[number]) => (
    <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>
      <Icon size={22} />
      <span>{t(label)}</span>
    </NavLink>
  );
  return (
    <nav className="tabbar">
      {left.map(item)}
      <div className="tab" />
      {right.map(item)}
      <button className="fab" aria-label={t('Ku dar')} onClick={open}>
        <Plus size={30} color="#fff" />
      </button>
    </nav>
  );
}
