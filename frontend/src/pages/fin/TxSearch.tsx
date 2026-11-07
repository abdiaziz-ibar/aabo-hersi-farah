import { Search, SearchX, X } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Empty, ExportButtons, Pager, Spinner, nextSort, useToast } from '../../components/fin/parts';
import { TxTable } from '../../components/fin/TxTable';
import { CustomerHit, Filters, TxPage, finApi, fmtDay, fmtMoney, prettyPhone } from '../../lib/finApi';

const FIELDS = ['name', 'phone', 'txId', 'source', 'type', 'from', 'to', 'minAmount', 'maxAmount'] as const;

export default function TxSearch() {
  const [sp, setSp] = useSearchParams();
  const toast = useToast();
  const [form, setForm] = useState<Record<string, string>>(() => Object.fromEntries(FIELDS.map((k) => [k, sp.get(k) ?? ''])));
  const [exact, setExact] = useState(sp.get('exact') === 'true');
  const [data, setData] = useState<{ customers: CustomerHit[]; transactions: TxPage } | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // The URL is the source of truth for the active search (so Back from a customer page restores it).
  const active: Filters = {
    ...Object.fromEntries(FIELDS.map((k) => [k, sp.get(k) ?? ''])),
    exact: sp.get('exact') === 'true',
    page: Number(sp.get('page')) || 1,
    pageSize: Number(sp.get('pageSize')) || 25,
    sort: sp.get('sort') || 'date',
    dir: sp.get('dir') || 'desc',
  };
  const activeKey = sp.toString();

  useEffect(() => {
    let live = true;
    setLoading(true);
    setErr(null);
    finApi.search(active).then((d) => { if (live) setData(d); }).catch((e) => {
      if (!live) return;
      setErr(e.message); setData(null); toast.bad(e.message);
    }).finally(() => live && setLoading(false));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);

  const apply = useCallback((patch: Record<string, string | number | boolean | undefined>, resetPage = true) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === '' || v === false) next.delete(k); else next.set(k, String(v));
    }
    if (resetPage) next.delete('page');
    setSp(next);
  }, [sp, setSp]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    apply({ ...form, exact });
  };
  const clear = () => {
    setForm(Object.fromEntries(FIELDS.map((k) => [k, ''])));
    setExact(false);
    setSp(new URLSearchParams());
  };
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const hasFilter = FIELDS.some((k) => sp.get(k));
  const tx = data?.transactions;
  const exportFilters = { ...active, page: undefined, pageSize: undefined } as Filters;

  return (
    <div className="page">
      <PageHeader title="Transaction Search" subtitle="Find any person by name, phone number or transaction ID — across EVC Plus and Salaam Bank" hideAdd />

      <form className="card" onSubmit={submit}>
        <div className="fin-filters">
          <label className="field span2">Customer name<input className="input" placeholder="e.g. Hodan Ali (partial, any case)" value={form.name} onChange={set('name')} /></label>
          <label className="field">Phone number<input className="input" inputMode="tel" placeholder="e.g. 0611234567 or 1234" value={form.phone} onChange={set('phone')} /></label>
          <label className="field">Transaction ID<input className="input" value={form.txId} onChange={set('txId')} /></label>
          <label className="field">Source
            <select className="input" value={form.source} onChange={set('source')}>
              <option value="">Both sources</option><option value="EVC_PLUS">EVC Plus</option><option value="SALAAM_BANK">Salaam Bank</option>
            </select>
          </label>
          <label className="field">Type
            <select className="input" value={form.type} onChange={set('type')}>
              <option value="">All types</option><option value="SENT">Sent</option><option value="RECEIVED">Received</option><option value="TRANSFER">Transfer</option>
            </select>
          </label>
          <label className="field">From date<input className="input" type="date" value={form.from} onChange={set('from')} /></label>
          <label className="field">To date<input className="input" type="date" value={form.to} onChange={set('to')} /></label>
          <label className="field">Min amount<input className="input" type="number" min="0" step="0.01" value={form.minAmount} onChange={set('minAmount')} /></label>
          <label className="field">Max amount<input className="input" type="number" min="0" step="0.01" value={form.maxAmount} onChange={set('maxAmount')} /></label>
        </div>
        <div className="fin-actions">
          <button className="btn primary" type="submit"><Search size={16} /> Search</button>
          <button className="btn" type="button" onClick={clear} disabled={!hasFilter && !Object.values(form).some(Boolean)}><X size={16} /> Clear</button>
          <label className="check"><input type="checkbox" checked={exact} onChange={(e) => setExact(e.target.checked)} /> Exact phone match</label>
        </div>
      </form>

      {err && <div className="alert danger">{err}</div>}
      {loading && !data && <div className="card"><Spinner label="Searching…" /></div>}

      {data && data.customers.length > 0 && (
        <section className="stack">
          <h3>People found <span className="muted small">({data.customers.length}{data.customers.length === 50 ? '+' : ''})</span></h3>
          <div className="cust-grid">
            {data.customers.map((c) => {
              const t = c.totals[0];
              return (
                <Link key={c.key} className="cust-card" to={`/fin/customer/${encodeURIComponent(c.key)}`}>
                  <strong>{c.name || prettyPhone(c.phone) || 'Unknown'}</strong>
                  <span className="muted small mono">{prettyPhone(c.phone) || 'no phone on file'}</span>
                  <div className="cust-nums">
                    <span className="muted">Transactions</span><b>{c.count}</b>
                    <span className="muted">Received</span><b className="inc-c">{fmtMoney(t.received, t.currency)}</b>
                    <span className="muted">Sent</span><b className="exp-c">{fmtMoney(t.sent, t.currency)}</b>
                    <span className="muted">Net</span><b>{fmtMoney(t.net, t.currency)}</b>
                  </div>
                  {c.totals.length > 1 && <span className="muted small">+ {c.totals.length - 1} more currenc{c.totals.length === 2 ? 'y' : 'ies'}</span>}
                  {c.lastAt && <span className="muted small">Last: {fmtDay(c.lastAt)}</span>}
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {tx && (
        <div className="card flush">
          <div className="card-head pad">
            <div>
              <h3>Transactions</h3>
              <p className="muted small">
                {tx.total.toLocaleString()} match{tx.total === 1 ? '' : 'es'}
                {tx.summary.map((s) => ` · ${fmtMoney(s.volume, s.currency)} total volume`).join('')}
              </p>
            </div>
            <ExportButtons disabled={!tx.total} onExport={(f) => finApi.exportTx(exportFilters, f)} />
          </div>
          {loading && <Spinner />}
          {!loading && tx.total === 0 && (
            <Empty icon={<SearchX size={34} />} title={hasFilter ? 'No transactions match your search' : 'No transactions imported yet'}>
              {hasFilter ? 'Try a shorter name, fewer digits, or widen the date range.' : <>Upload a file on the <Link className="link" to="/fin/import">CSV Import</Link> page first.</>}
            </Empty>
          )}
          {!loading && tx.total > 0 && (
            <>
              <TxTable rows={tx.rows} sort={active.sort!} dir={active.dir!} onSort={(k) => apply(nextSort({ sort: active.sort!, dir: active.dir! }, k), false)} />
              <Pager page={tx.page} pages={tx.pages} total={tx.total} pageSize={tx.pageSize}
                onPage={(p) => apply({ page: p }, false)} onSize={(n) => apply({ pageSize: n })} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
