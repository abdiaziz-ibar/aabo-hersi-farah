import {
  ArrowDownCircle, ArrowUpCircle, Eye, EyeOff, Plus, RefreshCw, Scale, Sparkles,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { BarChart, DonutChart } from '../components/charts';
import { PageHeader } from '../components/PageHeader';
import { TxRow } from '../components/TxRow';
import { HIDDEN, money, shortMonth } from '../lib/format';
import { monthName, useLang } from '../i18n';
import { balanceUpTo, expensesByPlace, lastMonths, monthTotals, YM } from '../lib/stats';
import { chartColors } from '../lib/theme';
import { iconFor } from '../lib/icons';
import { useStore } from '../store';

/** Touch pull-to-refresh: pull down from the top of the page. */
function usePullToRefresh(onRefresh: () => Promise<void>) {
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const startY = useRef<number | null>(null);
  const pullRef = useRef(0);

  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      startY.current = window.scrollY <= 0 ? e.touches[0].clientY : null;
    };
    const onMove = (e: TouchEvent) => {
      if (startY.current == null) return;
      const d = Math.max(0, Math.min(90, (e.touches[0].clientY - startY.current) * 0.5));
      pullRef.current = d;
      setPull(d);
    };
    const onEnd = async () => {
      const trigger = pullRef.current >= 55;
      startY.current = null;
      pullRef.current = 0;
      setPull(0);
      if (trigger) {
        setBusy(true);
        await onRefresh();
        setBusy(false);
      }
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };
  }, [onRefresh]);

  return { pull, busy };
}

export default function Home() {
  const { transactions, activeAccounts, loading, error, hideBalances, toggleHide, dark, refresh, loadSample } = useStore();
  const { t, place, lang } = useLang();
  const { user, isAdmin } = useAuth();
  const nav = useNavigate();
  const colors = chartColors(dark);

  const now = new Date();
  const [ym, setYm] = useState<YM>({ y: now.getFullYear(), m: now.getMonth() });
  const months = useMemo(() => lastMonths({ y: now.getFullYear(), m: now.getMonth() }, 12).reverse(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const doRefresh = useCallback(() => refresh(), [refresh]);
  const { pull, busy } = usePullToRefresh(doRefresh);
  const [spin, setSpin] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const totals = useMemo(() => monthTotals(transactions, ym), [transactions, ym]);
  const total = useMemo(() => balanceUpTo(transactions, ym), [transactions, ym]);
  const bars = useMemo(
    () => lastMonths(ym, 6).map((x) => {
      const t = monthTotals(transactions, x);
      return { label: shortMonth(x.m), a: t.income, b: t.expense };
    }),
    [transactions, ym, lang],
  );
  const places = useMemo(() => expensesByPlace(transactions, ym, 3), [transactions, ym]);
  const latest = useMemo(
    () => [...transactions].sort((a, b) => +new Date(b.date) - +new Date(a.date)).slice(0, 5),
    [transactions],
  );
  const show = (n: number) => (hideBalances ? HIDDEN : money(n));
  const net = totals.income - totals.expense;
  const empty = !loading && transactions.length === 0;
  const hello = user?.fullName || user?.username;

  return (
    <div className="page" style={{ transform: pull ? `translateY(${pull}px)` : undefined }}>
      {(pull > 0 || busy) && (
        <div className="ptr"><RefreshCw size={18} className={busy ? 'spin' : ''} /></div>
      )}

      <PageHeader title={t('Dashboard')} subtitle={t('Salaan, {name}', { name: hello ?? '' })}>
        <select
          className="input compact"
          aria-label={t('Dooro bisha')}
          value={`${ym.y}-${ym.m}`}
          onChange={(e) => {
            const [y, m] = e.target.value.split('-').map(Number);
            setYm({ y, m });
          }}
        >
          {months.map((x) => (
            <option key={`${x.y}-${x.m}`} value={`${x.y}-${x.m}`}>{monthName(x.m)} {x.y}</option>
          ))}
        </select>
        <button className="icon-btn outline" title={t('Cusboonaysii')} aria-label={t('Cusboonaysii')}
          onClick={async () => { setSpin(true); await refresh(); setSpin(false); }}>
          <RefreshCw size={18} className={spin ? 'spin' : ''} />
        </button>
        <button className="icon-btn outline" title={hideBalances ? t('Tus lacagaha') : t('Qari lacagaha')}
          aria-label={hideBalances ? t('Tus lacagaha') : t('Qari lacagaha')} onClick={toggleHide}>
          {hideBalances ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </PageHeader>

      {error && (
        <div className="alert danger">
          {error}. <button className="link" onClick={() => void refresh()}>{t('Isku day mar kale')}</button>
        </div>
      )}

      <section className="kpis">
        <div className="kpi hero-kpi">
          <div className="kpi-label"><Scale size={16} /> {t('Wadarta hadhaagga')}</div>
          <div className="kpi-value">{show(total)}</div>
          <div className="kpi-sub">{t('Ilaa dhammaadka {month}', { month: monthName(ym.m) })}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label"><ArrowDownCircle size={16} className="inc-c" /> {t('Soo gashay')}</div>
          <div className="kpi-value">{show(totals.income)}</div>
          <div className="kpi-sub">{monthName(ym.m)} {ym.y}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label"><ArrowUpCircle size={16} className="exp-c" /> {t('Baxday')}</div>
          <div className="kpi-value">{show(totals.expense)}</div>
          <div className="kpi-sub">{monthName(ym.m)} {ym.y}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label"><Scale size={16} /> {t('Isbeddelka bisha')}</div>
          <div className={`kpi-value ${net >= 0 ? 'inc-c' : 'exp-c'}`}>{hideBalances ? HIDDEN : `${net >= 0 ? '+' : '-'}${money(Math.abs(net))}`}</div>
          <div className="kpi-sub">{t('Soo gashay − Baxday')}</div>
        </div>
      </section>

      <section className="accounts">
        {activeAccounts.map((a) => {
          const Icon = iconFor(a.icon);
          return (
            <button key={a.id} className="card account" onClick={() => nav(`/history?account=${a.id}`)}>
              <span className="account-icon"><Icon size={20} /></span>
              <span className="account-text">
                <span className="muted small">{a.name}</span>
                <strong>{show(balanceUpTo(transactions, ym, a.id))}</strong>
              </span>
            </button>
          );
        })}
        {isAdmin && (
          <Link to="/accounts" className="account add-account">
            <span className="account-icon"><Plus size={20} /></span>
            <span className="account-text"><strong className="add-label">{t('Maamul xisaabaha')}</strong></span>
          </Link>
        )}
      </section>

      {empty ? (
        <div className="card empty">
          <span className="account-icon big"><Sparkles size={30} /></span>
          <h3>{t('Bilow dhaqdhaqaaqaaga ugu horreeya')}</h3>
          <p className="muted">{t('Taabo “Ku dar” si aad u darto lacag soo gashay ama bixid.')}</p>
          {isAdmin && (
            <button
              className="btn"
              disabled={seeding}
              onClick={async () => {
                setSeeding(true);
                try { await loadSample(); } finally { setSeeding(false); }
              }}
            >
              {t('Soo geli xog tijaabo')}
            </button>
          )}
        </div>
      ) : (
        !loading && (
          <>
            <section className="charts">
              <div className="card">
                <div className="card-head">
                  <h3>{t('Soo gal iyo bixid')}</h3>
                  <div className="legend">
                    <span><i style={{ background: colors.income }} /> {t('Soo gashay')}</span>
                    <span><i style={{ background: colors.expense }} /> {t('Baxday')}</span>
                  </div>
                </div>
                <BarChart data={bars} colorA={colors.income} colorB={colors.expense} gridColor={colors.grid} labelColor={colors.label} />
              </div>

              <div className="card">
                <div className="card-head"><h3>{t('Bixidda halka ay aaday')}</h3></div>
                {places.length === 0 ? (
                  <p className="muted">{t('Bishan ma jirto bixid la diiwaangeliyey.')}</p>
                ) : (
                  <div className="donut-row">
                    <DonutChart
                      data={places.map((s, i) => ({ value: s.value, color: colors.slices[i] ?? colors.slices[3] }))}
                      trackColor={colors.grid}
                      centerLabel={show(totals.expense)}
                      centerSub={t('Wadarta')}
                    />
                    <div className="legend-col">
                      {places.map((s, i) => (
                        <div key={s.label} className="legend-row">
                          <i style={{ background: colors.slices[i] ?? colors.slices[3] }} />
                          <span>{place(s.label)}</span>
                          <b className="muted">{s.pct}%</b>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>

            <div className="card">
              <div className="card-head">
                <h3>{t('Dhaqdhaqaaqii ugu dambeeyey')}</h3>
                <Link to="/history" className="link">{t('Dhammaan →')}</Link>
              </div>
              {latest.map((t) => <TxRow key={t.id} tx={t} hidden={hideBalances} />)}
            </div>
          </>
        )
      )}
    </div>
  );
}
