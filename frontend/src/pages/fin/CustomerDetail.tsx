import { ArrowLeft, UserX } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Empty, ExportButtons, Pager, SourceChip, Spinner, nextSort, useToast } from '../../components/fin/parts';
import { TxTable } from '../../components/fin/TxTable';
import { CustomerProfile, Filters, TxPage, finApi, fmtDateTime, fmtMoney, prettyPhone } from '../../lib/finApi';

export default function CustomerDetail() {
  const { key = '' } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const [data, setData] = useState<{ profile: CustomerProfile; transactions: TxPage } | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const active: Filters = {
    source: sp.get('source') ?? '', type: sp.get('type') ?? '', from: sp.get('from') ?? '', to: sp.get('to') ?? '',
    page: Number(sp.get('page')) || 1, pageSize: Number(sp.get('pageSize')) || 25, sort: sp.get('sort') || 'date', dir: sp.get('dir') || 'desc',
  };
  const activeKey = `${key}|${sp.toString()}`;

  useEffect(() => {
    let live = true;
    setLoading(true);
    setErr(null);
    finApi.customer(key, active).then((d) => { if (live) setData(d); }).catch((e) => {
      if (!live) return;
      setData(null); setErr(e.message); toast.bad(e.message);
    }).finally(() => live && setLoading(false));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);

  const apply = (patch: Record<string, string | number>, resetPage = true) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) { if (v === '' || v === undefined) next.delete(k); else next.set(k, String(v)); }
    if (resetPage) next.delete('page');
    setSp(next, { replace: true });
  };

  const p = data?.profile;
  const tx = data?.transactions;
  const exportFilters = { ...active, page: undefined, pageSize: undefined } as Filters;
  const title = p?.name || (p?.phone ? prettyPhone(p.phone) : decodeURIComponent(key).replace(/^n:/, ''));

  return (
    <div className="page">
      <PageHeader title={title} subtitle={p ? [prettyPhone(p.phone), p.otherNames.length ? `also seen as: ${p.otherNames.join(', ')}` : ''].filter(Boolean).join(' · ') || 'Customer profile' : 'Customer profile'} hideAdd>
        <button className="btn" onClick={() => (window.history.length > 1 ? nav(-1) : nav('/fin/search'))}><ArrowLeft size={16} /> Back</button>
        {p && <ExportButtons onExport={(f) => finApi.exportCustomer(key, exportFilters, f)} />}
      </PageHeader>

      {err && !loading && <div className="card"><Empty icon={<UserX size={34} />} title="Customer not found">{err} <Link className="link" to="/fin/search">Back to search</Link></Empty></div>}
      {loading && !data && <div className="card"><Spinner label="Loading customer…" /></div>}

      {p && tx && (
        <>
          <div className="card">
            <div className="fin-filters">
              <label className="field">Source
                <select className="input" value={active.source} onChange={(e) => apply({ source: e.target.value })}>
                  <option value="">Both sources</option><option value="EVC_PLUS">EVC Plus</option><option value="SALAAM_BANK">Salaam Bank</option>
                </select>
              </label>
              <label className="field">Type
                <select className="input" value={active.type} onChange={(e) => apply({ type: e.target.value })}>
                  <option value="">All types</option><option value="SENT">Sent</option><option value="RECEIVED">Received</option><option value="TRANSFER">Transfer</option>
                </select>
              </label>
              <label className="field">From date<input className="input" type="date" value={active.from} onChange={(e) => apply({ from: e.target.value })} /></label>
              <label className="field">To date<input className="input" type="date" value={active.to} onChange={(e) => apply({ to: e.target.value })} /></label>
            </div>
          </div>

          {p.totals.map((t) => (
            <section key={t.currency} className="stack">
              {p.totals.length > 1 && <h3>{t.currency}</h3>}
              <div className="stat-grid">
                <div className="stat pos"><div className="l">Total received</div><div className="v">{fmtMoney(t.received, t.currency)}</div></div>
                <div className="stat neg"><div className="l">Total sent</div><div className="v">{fmtMoney(t.sent, t.currency)}</div></div>
                <div className={`stat ${t.net >= 0 ? 'pos' : 'neg'}`}><div className="l">Net (received − sent)</div><div className="v">{fmtMoney(t.net, t.currency)}</div></div>
                <div className="stat"><div className="l">Transfers</div><div className="v">{fmtMoney(t.transfers, t.currency)}</div><div className="s">between the same person — not counted as sent or received</div></div>
                <div className="stat"><div className="l">Transactions</div><div className="v">{t.count.toLocaleString()}</div></div>
              </div>
            </section>
          ))}

          <div className="stat-grid">
            <div className="stat"><div className="l">First transaction</div><div className="v" style={{ fontSize: 17 }}>{fmtDateTime(p.firstAt)}</div></div>
            <div className="stat"><div className="l">Most recent</div><div className="v" style={{ fontSize: 17 }}>{fmtDateTime(p.lastAt)}</div></div>
            <div className="stat"><div className="l">All transactions</div><div className="v">{p.count.toLocaleString()}</div></div>
          </div>

          <div className="card flush">
            <div className="card-head pad"><h3>Totals by source</h3></div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Source</th><th>Currency</th><th className="num">Transactions</th><th className="num">Received</th><th className="num">Sent</th><th className="num">Transfers</th><th className="num">Net</th></tr></thead>
                <tbody>
                  {p.bySource.map((s) => (
                    <tr key={`${s.source}-${s.currency}`}>
                      <td><SourceChip source={s.source} /></td><td>{s.currency}</td><td className="num">{s.count}</td>
                      <td className="num inc-c">{fmtMoney(s.received, '').trim()}</td><td className="num exp-c">{fmtMoney(s.sent, '').trim()}</td>
                      <td className="num">{fmtMoney(s.transfers, '').trim()}</td><td className="num strong">{fmtMoney(s.net, '').trim()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card flush">
            <div className="card-head pad">
              <div><h3>Transaction history</h3><p className="muted small">{tx.total.toLocaleString()} transaction{tx.total === 1 ? '' : 's'} — all of them, across pages</p></div>
            </div>
            {loading ? <Spinner /> : tx.total === 0 ? <Empty title="No transactions match these filters" /> : (
              <>
                <TxTable rows={tx.rows} sort={active.sort!} dir={active.dir!} onSort={(k) => apply(nextSort({ sort: active.sort!, dir: active.dir! }, k), false)} />
                <Pager page={tx.page} pages={tx.pages} total={tx.total} pageSize={tx.pageSize} onPage={(n) => apply({ page: n }, false)} onSize={(n) => apply({ pageSize: n })} />
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
