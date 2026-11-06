import { Plus } from 'lucide-react';
import React from 'react';
import { useLang } from '../i18n';
import { useAddTx } from './AddTx';

interface Props {
  title: string;
  subtitle?: string;
  children?: React.ReactNode; // extra actions (left of the Add button)
  hideAdd?: boolean;
}

export function PageHeader({ title, subtitle, children, hideAdd }: Props) {
  const { open } = useAddTx();
  const { t } = useLang();
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      <div className="page-actions">
        {children}
        {!hideAdd && (
          <button className="btn primary desktop-only" onClick={open}>
            <Plus size={18} /> {t('Ku dar')}
          </button>
        )}
      </div>
    </header>
  );
}
