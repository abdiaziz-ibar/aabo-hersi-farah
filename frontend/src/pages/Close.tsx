import { CheckCircle2, LockKeyhole, LockOpen } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { PageHeader } from '../components/PageHeader';
import { fmtLong, money } from '../lib/format';
import { monthName, useLang } from '../i18n';
import { lastMonths } from '../lib/stats';
import { ClosingPreview, ClosingRecord, Summary } from '../lib/types';
import { useStore } from '../store';

export default function Close() {
  const { t } = useLang();
  const { isAdmin } = useAuth();
  const { refresh, accountName } = useStore();
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() + 1 }); // m: 1-12
  const [preview, setPreview] = useState<ClosingPreview | null>(null);
  const [history, setHistory] = useState<ClosingRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const months = useMemo(
    () => lastMonths({ y: now.getFullYear(), m: now.getMonth() }, 24).reverse().map((x) => ({ y: x.y, m: x.m + 1 })),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const load = useCallback(async () => {
    try {
      const [p, h] = await Promise.all([api.closingPreview(ym.y, ym.m), api.closings()]);
      setPreview(p);
      setHistory(h);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('Cillad'));
    }
  }, [ym]);

  useEffect(() => {
    setPreview(null);
    void load();
  }, [load]);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      await load();
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('Cillad'));
    } finally {
      setBusy(false);
    }
  };

  const closing = preview?.closing ?? null;
  const data: Summary | null = closing ? closing.snapshot : preview;
  const label = `${monthName(ym.m - 1)} ${ym.y}`;
  const isFuture = ym.y * 12 + ym.m > now.getFullYear() * 12 + now.getMonth() + 1;

  const onClose = () => {
    if (window.confirm(t('Ma xirtaa {label}? Marka la xiro, dhaqdhaqaaq lagama darin karo, lagamana tirtiri karo bishaas.', { label }))) {
      void act(() => api.closeMonth(ym.y, ym.m));
    }
  };
  const onReopen = () => {
    if (window.confirm(t('Ma dib u furtaa {label}? Dhaqdhaqaaqa bishaas mar kale ayaa la bedeli karaa.', { label }))) {
      void act(() => api.reopenMonth(ym.y, ym.m));
    }
  };

  return (
    <div className="page">
      <PageHeader title={t('Xisaab xir')} subtitle={t('Xir bisha si hadhaaggu u xaqiijiyo oo aan loo bedelin')} hideAdd>
        <select
          className="input compact"
          aria-label={t('Dooro bisha')}
          value={`${ym.y}-${ym.m}`}
          onChange={(e) => {
            const [y, m] = e.target.value.split('-').map(Number);
            setYm({ y, m });
          }}
        >
          {months.map((x) => <option key={`${x.y}-${x.m}`} value={`${x.y}-${x.m}`}>{monthName(x.m - 1)} {x.y}</option>)}
        </select>
      </PageHeader>

      {err && <div className="alert danger">{err}</div>}

      <div className="card">
        <div className="card-head">
          <div>
            <h3>{label}</h3>
            {closing ? (
              <p className="muted small">
                {t('Waxaa xiray')} <b>{closing.closedBy ?? '—'}</b> · {fmtLong(closing.closedAt)}
              </p>
            ) : (
              <p className="muted small">{t('Bishan weli waa furan tahay')}</p>
            )}
          </div>
          <div className="page-actions">
            <span className={`badge ${closing ? 'ok' : 'warn'}`}>
              {closing ? <><LockKeyhole size={13} /> {t('Xiran')}</> : <><LockOpen size={13} /> {t('Furan')}</>}
            </span>
            {isAdmin && (closing ? (
              <button className="btn" disabled={busy} onClick={onReopen}><LockOpen size={16} /> {t('Dib u fur')}</button>
            ) : (
              <button className="btn primary" disabled={busy || isFuture || !preview} onClick={onClose}>
                <CheckCircle2 size={16} /> {t('Xir bisha')}
              </button>
            ))}
          </div>
        </div>

        {!data ? (
          <p className="muted">{t('Waa la soo rarayaa…')}</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('Xisaab')}</th>
                  <th className="num">{t('Hadhaagii hore')}</th>
                  <th className="num">{t('Soo gashay')}</th>
                  <th className="num">{t('Baxday')}</th>
                  <th className="num">{t('Hadhaagga xiritaanka')}</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.accounts).map(([id, r]) => {
                  return (
                    <tr key={id}>
                      <td className="strong">{accountName(id)}</td>
                      <td className="num">{money(r.opening)}</td>
                      <td className="num inc-c">+{money(r.income)}</td>
                      <td className="num exp-c">-{money(r.expense)}</td>
                      <td className="num strong">{money(r.closing)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td>{t('Wadarta')}</td>
                  <td className="num">{money(data.totals.opening)}</td>
                  <td className="num inc-c">+{money(data.totals.income)}</td>
                  <td className="num exp-c">-{money(data.totals.expense)}</td>
                  <td className="num strong">{money(data.totals.closing)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {!isAdmin && <p className="muted small" style={{ marginTop: 12 }}>{t('Maamulaha (Admin) kaliya ayaa xiri kara ama dib u furi kara bisha.')}</p>}
      </div>

      <div className="card flush">
        <div className="card-head pad"><h3>{t('Bilihii la xiray')}</h3></div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>{t('Bisha')}</th><th>{t('La xiray')}</th><th>{t('Waxaa xiray')}</th><th className="num">{t('Hadhaagga xiritaanka')}</th></tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={`${h.year}-${h.month}`} className="clickable" onClick={() => setYm({ y: h.year, m: h.month })}>
                  <td className="strong">{monthName(h.month - 1)} {h.year}</td>
                  <td>{fmtLong(h.closedAt)}</td>
                  <td>{h.closedBy ?? '—'}</td>
                  <td className="num strong">{money(h.snapshot.totals.closing)}</td>
                </tr>
              ))}
              {history.length === 0 && <tr><td colSpan={4} className="empty-row">{t('Weli bil lama xirin.')}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
