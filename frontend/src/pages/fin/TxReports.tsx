import { BarChart3 } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Empty, ExportButtons, SourceChip, Spinner, useToast } from '../../components/fin/parts';
import { Filters, Summary, Top, TopCustomers, finApi, fmtDay, fmtMoney, prettyPhone } from '../../lib/finApi';

const PERIODS = [['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly']] as const;

function TopTable({ title, rows, label, currency, report, filters }: { title: string; rows: Top[]; label: string; currency: string; report: string; filters: Filters }) {
  return (
    <div className="card flush">
      <div className="card-head pad"><h3>{title}</h3><ExportButtons disabled={!rows.length} onExport={(f) => finApi.exportReport(report, filters, f)} /></div>
      {rows.length === 0 ? <Empty title="No data" /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>#</th><th>Person</th><th className="num">Transactions</th><th className="num">{label}</th></tr></thead>
            <tbody>
              {rows.map((r, i) => {
                const key = r.phone ? `p:${r.phone}` : r.key;
                return (
                  <tr key={`${r.phone}-${r.name}-${i}`}>
                    <td className="muted">{i + 1}</td>
                    <td>{key ? <Link className="link" to={`/fin/customer/${encodeURIComponent(key)}`}>{r.name || prettyPhone(r.phone)}</Link> : r.name}
                      {r.phone && r.name && <div className="muted small mono">{prettyPhone(r.phone)}</div>}</td>
                    <td className="num">{r.count.toLocaleString()}</td>
                    <td className="num strong">{fmtMoney(r.total, currency)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function TxReports() {
  const toast = useToast();
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [f, setF] = useState({ from: '', to: '', source: '', currency: '' });
  const [sum, setSum] = useState<Summary | null>(null);
  const [top, setTop] = useState<TopCustomers | null>(null);
  const [loading, setLoading] = useState(true);

  const filters: Filters = { ...f, period };

  useEffect(() => {
    let live = true;
    setLoading(true);
    Promise.all([finApi.summary(filters), finApi.top({ ...filters, limit: 10 })])
      .then(([s, t]) => { if (live) { setSum(s); setTop(t); } })
      .catch((e) => { if (live) toast.bad(e.message); })
      .finally(() => live && setLoading(false));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, f.from, f.to, f.source, f.currency]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const cur = sum?.currency ?? 'USD';
  const max = Math.max(1, ...(sum?.series ?? []).map((s) => s.received + s.sent + s.transfers));

  return (
    <div className="page">
      <PageHeader title="Transaction Reports" subtitle="Daily, weekly and monthly totals, top customers and source comparison" hideAdd />

      <div className="card">
        <div className="fin-filters">
          <label className="field">From date<input className="input" type="date" value={f.from} onChange={set('from')} /></label>
          <label className="field">To date<input className="input" type="date" value={f.to} onChange={set('to')} /></label>
          <label className="field">Source
            <select className="input" value={f.source} onChange={set('source')}>
              <option value="">Both sources</option><option value="EVC_PLUS">EVC Plus</option><option value="SALAAM_BANK">Salaam Bank</option>
            </select>
          </label>
          <label className="field">Currency
            <select className="input" value={f.currency || cur} onChange={set('currency')} disabled={!sum || sum.currencies.length < 2}>
              {(sum?.currencies.length ? sum.currencies : [cur]).map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
        </div>
        <p className="hint" style={{ marginTop: 10 }}>
          Reports use one currency at a time so amounts are never mixed. “Sent” and “Received” follow each row's type, which comes from the statement holder you entered at import.
        </p>
      </div>

      {loading && !sum && <div className="card"><Spinner label="Building reports…" /></div>}
      {sum && !sum.totals && (
        <div className="card"><Empty icon={<BarChart3 size={34} />} title="No transactions to report on">Import a CSV on the <Link className="link" to="/fin/import">CSV Import</Link> page, or widen the filters.</Empty></div>
      )}

      {sum?.totals && top && (
        <>
          <div className="stat-grid" style={{ opacity: loading ? 0.6 : 1 }}>
            <div className="stat pos"><div className="l">Total received</div><div className="v">{fmtMoney(sum.totals.received, cur)}</div></div>
            <div className="stat neg"><div className="l">Total sent</div><div className="v">{fmtMoney(sum.totals.sent, cur)}</div></div>
            <div className="stat"><div className="l">Transfers</div><div className="v">{fmtMoney(sum.totals.transfers, cur)}</div></div>
            <div className="stat"><div className="l">Total volume</div><div className="v">{fmtMoney(sum.totals.volume, cur)}</div></div>
            <div className="stat"><div className="l">Transactions</div><div className="v">{sum.totals.count.toLocaleString()}</div></div>
          </div>

          <div className="card flush">
            <div className="card-head pad">
              <div className="seg" role="tablist">
                {PERIODS.map(([k, l]) => <button key={k} role="tab" aria-selected={period === k} className={period === k ? 'on' : ''} onClick={() => setPeriod(k)}>{l}</button>)}
              </div>
              <ExportButtons onExport={(x) => finApi.exportReport('summary', filters, x)} />
            </div>
            <div style={{ padding: '0 20px 16px' }} className="bars">
              <div className="legend"><span><i style={{ background: 'var(--income)' }} />Received</span><span><i style={{ background: 'var(--expense)' }} />Sent</span><span><i style={{ background: 'var(--warn)' }} />Transfers</span></div>
              {sum.series.slice(0, 60).map((s) => (
                <div className="bar-row" key={s.period}>
                  <span className="muted">{s.period}</span>
                  <div className="bar-track" title={`Received ${s.received} · Sent ${s.sent} · Transfers ${s.transfers}`}>
                    <i className="r" style={{ width: `${(s.received / max) * 100}%` }} /><i className="s" style={{ width: `${(s.sent / max) * 100}%` }} /><i className="t" style={{ width: `${(s.transfers / max) * 100}%` }} />
                  </div>
                  <span className="num small">{s.count} tx</span>
                </div>
              ))}
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Period</th><th className="num">Transactions</th><th className="num">Received</th><th className="num">Sent</th><th className="num">Transfers</th><th className="num">Volume</th></tr></thead>
                <tbody>
                  {sum.series.map((s) => (
                    <tr key={s.period}>
                      <td className="nowrap">{s.period}</td><td className="num">{s.count}</td>
                      <td className="num inc-c">{fmtMoney(s.received, '').trim()}</td><td className="num exp-c">{fmtMoney(s.sent, '').trim()}</td>
                      <td className="num">{fmtMoney(s.transfers, '').trim()}</td><td className="num strong">{fmtMoney(s.volume, '').trim()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card flush">
            <div className="card-head pad"><h3>EVC Plus vs Salaam Bank</h3><ExportButtons onExport={(x) => finApi.exportReport('sources', filters, x)} /></div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Source</th><th className="num">Transactions</th><th className="num">Received</th><th className="num">Sent</th><th className="num">Transfers</th><th className="num">Volume</th><th className="num">Average</th><th className="num">Largest</th><th className="num">Phones</th><th>Period covered</th></tr></thead>
                <tbody>
                  {sum.sources.map((s) => (
                    <tr key={s.source}>
                      <td><SourceChip source={s.source} /></td><td className="num">{s.count.toLocaleString()}</td>
                      <td className="num inc-c">{fmtMoney(s.received, '').trim()}</td><td className="num exp-c">{fmtMoney(s.sent, '').trim()}</td>
                      <td className="num">{fmtMoney(s.transfers, '').trim()}</td><td className="num strong">{fmtMoney(s.volume, '').trim()}</td>
                      <td className="num">{fmtMoney(s.average, '').trim()}</td><td className="num">{fmtMoney(s.largest, '').trim()}</td>
                      <td className="num">{s.phones}</td><td className="nowrap small">{fmtDay(s.firstAt)} – {fmtDay(s.lastAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="two-col">
            <TopTable title="Top 10 senders" rows={top.topSenders} label="Total sent" currency={cur} report="senders" filters={filters} />
            <TopTable title="Top 10 receivers" rows={top.topReceivers} label="Total received" currency={cur} report="receivers" filters={filters} />
          </div>
          <TopTable title="Most active phone numbers" rows={top.activePhones} label="Total amount" currency={cur} report="active" filters={filters} />
        </>
      )}
    </div>
  );
}
