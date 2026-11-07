import { AlertCircle, ArrowDown, ArrowUp, CheckCircle2, ChevronLeft, ChevronRight, Download, FileSpreadsheet, Loader2, X } from 'lucide-react';
import React, { createContext, useCallback, useContext, useState } from 'react';
import { FinTx, SOURCE_LABEL, Source, TxKind } from '../../lib/finApi';
import '../../fin.css';

/* ---------- toasts ---------- */
interface Toast { id: number; kind: 'ok' | 'bad'; text: string }
const ToastCtx = createContext<{ ok: (t: string) => void; bad: (t: string) => void }>({ ok: () => {}, bad: () => {} });
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, kind, text }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), kind === 'bad' ? 8000 : 4500);
  }, []);
  const value = React.useMemo(() => ({ ok: (t: string) => push('ok', t), bad: (t: string) => push('bad', t) }), [push]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.kind === 'ok' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            <span>{t.text}</span>
            <button className="icon-btn ghost" style={{ width: 22, height: 22 }} aria-label="Dismiss" onClick={() => setItems((x) => x.filter((y) => y.id !== t.id))}><X size={14} /></button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- badges ---------- */
export const SourceChip = ({ source }: { source: Source }) => (
  <span className={`chip ${source === 'EVC_PLUS' ? 'evc' : 'bank'}`}>{SOURCE_LABEL[source]}</span>
);
export const TypeChip = ({ type }: { type: TxKind }) => (
  <span className={`chip ${type.toLowerCase()}`}>{type === 'SENT' ? 'Sent' : type === 'RECEIVED' ? 'Received' : 'Transfer'}</span>
);

export const Spinner = ({ label }: { label?: string }) => (
  <div className="empty small-pad muted"><Loader2 className="spin" size={26} />{label && <span>{label}</span>}</div>
);

export const Empty = ({ icon, title, children }: { icon?: React.ReactNode; title: string; children?: React.ReactNode }) => (
  <div className="empty small-pad">
    <span className="muted">{icon ?? <FileSpreadsheet size={34} />}</span>
    <h3>{title}</h3>
    {children && <p className="muted small">{children}</p>}
  </div>
);

/* ---------- export buttons ---------- */
export function ExportButtons({ onExport, disabled }: { onExport: (f: 'csv' | 'xlsx') => Promise<void>; disabled?: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();
  const go = async (f: 'csv' | 'xlsx') => {
    setBusy(f);
    try { await onExport(f); toast.ok(`Export ready (${f.toUpperCase()})`); } catch (e) { toast.bad(e instanceof Error ? e.message : 'Export failed'); } finally { setBusy(null); }
  };
  return (
    <div className="row-gap">
      <button className="btn" disabled={disabled || !!busy} onClick={() => go('csv')}>{busy === 'csv' ? <Loader2 className="spin" size={16} /> : <Download size={16} />} CSV</button>
      <button className="btn" disabled={disabled || !!busy} onClick={() => go('xlsx')}>{busy === 'xlsx' ? <Loader2 className="spin" size={16} /> : <FileSpreadsheet size={16} />} Excel</button>
    </div>
  );
}

/* ---------- pagination ---------- */
export function Pager({ page, pages, total, pageSize, onPage, onSize }: {
  page: number; pages: number; total: number; pageSize: number; onPage: (p: number) => void; onSize: (n: number) => void;
}) {
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="pager">
      <span className="muted small">{from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}</span>
      <div className="row-gap">
        <select className="input compact" value={pageSize} aria-label="Rows per page" onChange={(e) => onSize(Number(e.target.value))}>
          {[10, 25, 50, 100, 200].map((n) => <option key={n} value={n}>{n} / page</option>)}
        </select>
        <button className="btn" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft size={16} /></button>
        <span className="small strong">Page {page} / {pages}</span>
        <button className="btn" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight size={16} /></button>
      </div>
    </div>
  );
}

/* ---------- sortable header ---------- */
export function SortTh({ label, k, sort, dir, onSort, num }: { label: string; k: string; sort: string; dir: string; onSort: (k: string) => void; num?: boolean }) {
  return (
    <th className={num ? 'num' : undefined} aria-sort={sort === k ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button className="th-sort" onClick={() => onSort(k)}>
        {label}{sort === k && (dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </button>
    </th>
  );
}

/** Pick the next sort state: same column flips direction, a new column starts descending (date/amount) or ascending. */
export const nextSort = (cur: { sort: string; dir: string }, k: string) =>
  cur.sort === k ? { sort: k, dir: cur.dir === 'asc' ? 'desc' : 'asc' } : { sort: k, dir: k === 'date' || k === 'amount' ? 'desc' : 'asc' };

export const txRowKey = (t: FinTx) => t.id;
