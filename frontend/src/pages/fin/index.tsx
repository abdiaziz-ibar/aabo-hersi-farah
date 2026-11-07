import { ArrowLeftRight, BarChart3, FileUp, Search } from 'lucide-react';
import React from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '../../auth';
import { ToastProvider } from '../../components/fin/parts';
import CsvImport from './CsvImport';
import CustomerDetail from './CustomerDetail';
import TxReports from './TxReports';
import TxSearch from './TxSearch';

const tabs = [
  ['/fin/import', 'CSV Import', FileUp],
  ['/fin/search', 'Transaction Search', Search],
  ['/fin/reports', 'Transaction Reports', BarChart3],
] as const;

/** Financial Transactions module. Admin only (the API enforces this too). */
export default function FinModule() {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/" replace />;
  return (
    <ToastProvider>
      <div className="page" style={{ gap: 14 }}>
        <nav className="fin-subnav" aria-label="Financial transactions">
          {tabs.map(([to, label, Icon]) => (
            <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'active' : '')}><Icon size={16} /> {label}</NavLink>
          ))}
        </nav>
      </div>
      <div style={{ marginTop: 14 }}>
        <Routes>
          <Route path="import" element={<CsvImport />} />
          <Route path="search" element={<TxSearch />} />
          <Route path="customer/:key" element={<CustomerDetail />} />
          <Route path="reports" element={<TxReports />} />
          <Route path="*" element={<Navigate to="search" replace />} />
        </Routes>
      </div>
    </ToastProvider>
  );
}

export const FinIcon = ArrowLeftRight;
