import { AlertTriangle, CheckCircle2, FileUp, Loader2, Trash2, Upload } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Modal } from '../../components/Modal';
import { PageHeader } from '../../components/PageHeader';
import { Empty, SourceChip, Spinner, useToast } from '../../components/fin/parts';
import { Batch, ImportResult, PreviewResult, finApi, fmtDateTime } from '../../lib/finApi';

const MAX_MB = 10;
const LARGE = 1000;

type Src = 'evc' | 'salaam';
const SRC: Record<Src, { label: string; hint: string }> = {
  evc: { label: 'EVC Plus', hint: 'Upload the CSV exported from EVC Plus.' },
  salaam: { label: 'Salaam Bank', hint: 'Upload the CSV statement exported from Salaam Bank.' },
};

const FIELD_GROUPS: { title: string; hint?: string; fields: [string, string][] }[] = [
  {
    title: 'Transaction',
    fields: [['transaction_date', 'Date *'], ['amount', 'Amount'], ['transaction_id', 'Transaction ID'], ['currency', 'Currency'], ['reference_number', 'Reference number'], ['description', 'Description']],
  },
  {
    title: 'Sender and receiver',
    hint: 'Use these when each row names both people.',
    fields: [['sender_name', 'Sender name'], ['sender_phone', 'Sender phone'], ['receiver_name', 'Receiver name'], ['receiver_phone', 'Receiver phone']],
  },
  {
    title: 'One account holder per statement',
    hint: 'Use these when rows show only the other person. Enter the account holder below so the system knows who is who.',
    fields: [['counterparty_name', 'Other party name'], ['counterparty_phone', 'Other party phone'], ['direction', 'Direction / type column'], ['debit', 'Debit (money out) column'], ['credit', 'Credit (money in) column']],
  },
];

const DEFAULT_OPTS = {
  ownerName: '', ownerPhone: '', dateOrder: 'DMY', sentValues: '', receivedValues: '', amountSign: 'none', defaultCurrency: '', allowMissingCounterparty: false,
};

export default function CsvImport() {
  const toast = useToast();
  const [src, setSrc] = useState<Src>('evc');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [opts, setOpts] = useState({ ...DEFAULT_OPTS });
  const [checking, setChecking] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [history, setHistory] = useState<Batch[] | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  const loadHistory = useCallback(() => finApi.batches().then(setHistory).catch((e) => toast.bad(e.message)), [toast]);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  const runPreview = useCallback(async (f: File, m: Record<string, string> | null, o: typeof DEFAULT_OPTS, s: Src) => {
    const my = ++seq.current;
    setChecking(true);
    setErr(null);
    try {
      const p = await finApi.preview(s, f, m, o);
      if (my !== seq.current) return;
      setPreview(p);
      if (m === null || !Object.keys(m).length) setMapping(p.mapping);
    } catch (e) {
      if (my !== seq.current) return;
      setPreview(null);
      setErr(e instanceof Error ? e.message : 'Could not read the file');
    } finally {
      if (my === seq.current) setChecking(false);
    }
  }, []);

  const pick = (f: File | undefined | null) => {
    if (!f) return;
    setResult(null);
    if (!/\.(csv|txt)$/i.test(f.name)) { setErr('Only .csv files are accepted.'); toast.bad('Only .csv files are accepted.'); return; }
    if (f.size > MAX_MB * 1024 * 1024) { setErr(`The file is larger than ${MAX_MB} MB.`); toast.bad(`The file is larger than ${MAX_MB} MB.`); return; }
    if (f.size === 0) { setErr('The file is empty.'); return; }
    setFile(f);
    setMapping({});
    setPreview(null);
    runPreview(f, null, opts, src);
  };

  // re-validate (debounced) whenever the admin edits the mapping or the options
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (!file || !preview) return;
    const t = setTimeout(() => runPreview(file, mapping, opts, src), 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapping, opts]);

  const reset = () => { seq.current++; setFile(null); setPreview(null); setMapping({}); setErr(null); setProgress(null); setChecking(false); if (input.current) input.current.value = ''; };
  const switchSrc = (s: Src) => { if (s !== src) { reset(); setResult(null); setSrc(s); } };

  const doImport = async () => {
    if (!file || !preview) return;
    setConfirm(false);
    setSaving(true);
    setProgress(0);
    try {
      const r = await finApi.commit(src, file, mapping, opts, setProgress);
      setResult(r);
      toast.ok(`Imported ${r.imported.toLocaleString()} transaction${r.imported === 1 ? '' : 's'}`);
      reset();
      loadHistory();
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Import failed';
      setErr(m);
      toast.bad(m);
    } finally {
      setSaving(false);
      setProgress(null);
    }
  };

  const removeBatch = async (b: Batch) => {
    if (!window.confirm(`Remove the import "${b.filename}" and its ${b.imported} transactions? This cannot be undone.`)) return;
    try { await finApi.deleteBatch(b.id); toast.ok('Import removed'); loadHistory(); } catch (e) { toast.bad(e instanceof Error ? e.message : 'Could not remove'); }
  };

  const setO = (k: keyof typeof DEFAULT_OPTS) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setOpts((o) => ({ ...o, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }));
  const ready = !!preview && preview.validRows > 0 && !checking && !saving;
  const usesHolder = !!(mapping.counterparty_name || mapping.counterparty_phone || mapping.direction || mapping.debit || mapping.credit);

  return (
    <div className="page">
      <PageHeader title="CSV Import" subtitle="Upload EVC Plus or Salaam Bank files into one searchable transaction database" hideAdd />

      {result && (
        <div className="card">
          <div className="card-head"><h3><CheckCircle2 size={18} style={{ verticalAlign: -3 }} className="inc-c" /> Import finished</h3><button className="btn" onClick={() => setResult(null)}>Dismiss</button></div>
          <div className="stat-grid">
            <div className="stat pos"><div className="l">Imported</div><div className="v">{result.imported.toLocaleString()}</div></div>
            <div className="stat"><div className="l">Already existed (skipped)</div><div className="v">{result.duplicates.toLocaleString()}</div></div>
            <div className={`stat ${result.invalid ? 'neg' : ''}`}><div className="l">Invalid rows (not imported)</div><div className="v">{result.invalid.toLocaleString()}</div></div>
            <div className="stat"><div className="l">Rows in file</div><div className="v">{result.total.toLocaleString()}</div></div>
          </div>
          {result.errors.length > 0 && <ErrorTable errors={result.errors} />}
          <p style={{ marginTop: 12 }}><Link className="link" to="/fin/search">Search the imported transactions →</Link></p>
        </div>
      )}

      <div className="card stack">
        <h3>1 · Choose the source</h3>
        <div className="source-pick">
          {(Object.keys(SRC) as Src[]).map((s) => (
            <button key={s} className={src === s ? 'on' : ''} onClick={() => switchSrc(s)} disabled={saving}>
              <strong>{SRC[s].label}</strong><span className="muted small">{SRC[s].hint}</span>
            </button>
          ))}
        </div>

        <h3>2 · Upload the CSV file</h3>
        <label
          className={`drop ${over ? 'over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files?.[0]); }}
        >
          <input ref={input} type="file" accept=".csv,.txt,text/csv" onChange={(e) => pick(e.target.files?.[0])} disabled={saving} />
          <FileUp size={34} />
          <strong>{file ? file.name : 'Drag & drop a CSV here, or click to browse'}</strong>
          <span className="small">{file ? `${(file.size / 1024).toFixed(1)} KB` : `CSV only · up to ${MAX_MB} MB · encoding and delimiter are detected automatically`}</span>
        </label>
        {err && <div className="alert danger" role="alert">{err}</div>}
        {checking && <Spinner label="Reading and validating the file…" />}
      </div>

      {preview && (
        <>
          <div className="card stack">
            <div className="card-head"><h3>3 · Match the columns</h3>
              <span className="muted small">{preview.encoding} · delimiter “{preview.delimiter === '\t' ? 'tab' : preview.delimiter}” · {preview.headers.length} columns</span>
            </div>
            <p className="hint">
              These dropdowns list the real column names found in your file. Nothing is assumed: the importer uses exactly what you pick here.
              Rows that cannot be understood are rejected and explained below instead of guessed.
            </p>
            <div className="map-grid">
              {FIELD_GROUPS.map((g) => (
                <React.Fragment key={g.title}>
                  <div className="map-grp">{g.title}{g.hint && <span className="muted" style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}> — {g.hint}</span>}</div>
                  {g.fields.map(([f, label]) => (
                    <label className="field" key={f}>{label}
                      <select className="input" value={mapping[f] ?? ''} onChange={(e) => setMapping((m) => { const n = { ...m }; if (e.target.value) n[f] = e.target.value; else delete n[f]; return n; })}>
                        <option value="">— not in this file —</option>
                        {preview.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </label>
                  ))}
                </React.Fragment>
              ))}
            </div>

            <div className="map-grp">Import options</div>
            <div className="map-grid">
              <label className="field">Date order for 04/03/2025
                <select className="input" value={opts.dateOrder} onChange={setO('dateOrder')}><option value="DMY">Day / Month / Year</option><option value="MDY">Month / Day / Year</option></select>
              </label>
              <label className="field">Default currency (if no column)<input className="input" maxLength={5} placeholder={src === 'evc' ? 'USD' : 'USD'} value={opts.defaultCurrency} onChange={setO('defaultCurrency')} /></label>
              <label className="field">Statement holder — name<input className="input" value={opts.ownerName} onChange={setO('ownerName')} placeholder="Whose account is this file?" /></label>
              <label className="field">Statement holder — phone / account<input className="input" inputMode="tel" value={opts.ownerPhone} onChange={setO('ownerPhone')} /></label>
              {mapping.direction && (
                <>
                  <label className="field">Direction values meaning “sent” (comma separated)<input className="input" value={opts.sentValues} onChange={setO('sentValues')} placeholder="exactly as written in the file" /></label>
                  <label className="field">Direction values meaning “received”<input className="input" value={opts.receivedValues} onChange={setO('receivedValues')} placeholder="exactly as written in the file" /></label>
                </>
              )}
              {mapping.amount && !mapping.direction && !mapping.debit && !mapping.credit && (
                <label className="field">Signed amounts
                  <select className="input" value={opts.amountSign} onChange={setO('amountSign')}><option value="none">Sign has no meaning</option><option value="negative_is_sent">Negative = holder sent, positive = holder received</option></select>
                </label>
              )}
              {usesHolder && <label className="check" style={{ alignSelf: 'end', minHeight: 40 }}><input type="checkbox" checked={opts.allowMissingCounterparty} onChange={setO('allowMissingCounterparty')} /> Allow rows with no other party (e.g. fees)</label>}
            </div>
            {usesHolder && !opts.ownerName && !opts.ownerPhone && <div className="alert danger">This layout needs the statement holder (name or phone) so the system can tell who sent and who received.</div>}
          </div>

          <div className="card stack">
            <h3>4 · Check the data</h3>
            <div className="stat-grid" style={{ opacity: checking ? 0.6 : 1 }}>
              <div className="stat"><div className="l">Rows in file</div><div className="v">{preview.totalRows.toLocaleString()}</div></div>
              <div className="stat pos"><div className="l">Valid — will import</div><div className="v">{preview.validRows.toLocaleString()}</div></div>
              <div className={`stat ${preview.invalidRows ? 'neg' : ''}`}><div className="l">Invalid — will be skipped</div><div className="v">{preview.invalidRows.toLocaleString()}</div></div>
            </div>

            <h4>File preview (first {preview.sample.length} rows)</h4>
            <div className="table-wrap card flush">
              <table className="table">
                <thead><tr><th>#</th>{preview.headers.map((h) => <th key={h}>{h}{Object.entries(mapping).filter(([, c]) => c === h).map(([f]) => <div key={f} className="chip evc" style={{ marginTop: 4 }}>{f.replace(/_/g, ' ')}</div>)}</th>)}</tr></thead>
                <tbody>{preview.sample.map((r) => <tr key={r.row}><td className="muted">{r.row}</td>{preview.headers.map((h) => <td key={h} className="cell-clip">{r.cells[h]}</td>)}</tr>)}</tbody>
              </table>
            </div>

            {preview.parsedSample.length > 0 && (
              <>
                <h4>How the first valid rows will be saved</h4>
                <div className="table-wrap card flush">
                  <table className="table">
                    <thead><tr><th>Row</th><th>Date</th><th>Transaction ID</th><th>Sender</th><th>Receiver</th><th>Type</th><th className="num">Amount</th></tr></thead>
                    <tbody>{preview.parsedSample.map((r) => (
                      <tr key={String(r.row)}>
                        <td className="muted">{r.row}</td><td className="nowrap">{fmtDateTime(String(r.transaction_date))}</td><td className="mono">{r.transaction_id ?? '—'}</td>
                        <td>{r.sender_name ?? ''} <span className="muted mono">{r.sender_phone ? `+${r.sender_phone}` : ''}</span></td>
                        <td>{r.receiver_name ?? ''} <span className="muted mono">{r.receiver_phone ? `+${r.receiver_phone}` : ''}</span></td>
                        <td>{String(r.transaction_type)}</td><td className="num">{Number(r.amount).toFixed(2)} {r.currency}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </>
            )}

            {preview.errors.length > 0 && (
              <>
                <h4><AlertTriangle size={16} style={{ verticalAlign: -2 }} className="exp-c" /> Invalid rows{preview.invalidRows > preview.errors.length ? ` (showing the first ${preview.errors.length} of ${preview.invalidRows})` : ''}</h4>
                <ErrorTable errors={preview.errors} />
              </>
            )}

            {saving && (
              <div>
                <div className={`progress ${progress === 100 ? 'indet' : ''}`}><i style={{ width: `${progress ?? 0}%` }} /></div>
                <p className="muted small" style={{ marginTop: 6 }}>{progress === 100 ? 'Saving transactions to the database…' : `Uploading… ${progress ?? 0}%`}</p>
              </div>
            )}
            <div className="fin-actions">
              <button className="btn primary" disabled={!ready} onClick={() => (preview.validRows > LARGE ? setConfirm(true) : doImport())}>
                {saving ? <Loader2 className="spin" size={16} /> : <Upload size={16} />} Import {preview.validRows.toLocaleString()} valid row{preview.validRows === 1 ? '' : 's'}
              </button>
              <button className="btn" onClick={reset} disabled={saving}>Cancel</button>
              {preview.validRows === 0 && !checking && <span className="muted small">No valid rows yet — adjust the column matching above.</span>}
            </div>
          </div>
        </>
      )}

      <div className="card flush">
        <div className="card-head pad"><h3>Import history</h3></div>
        {!history ? <Spinner /> : history.length === 0 ? <Empty title="No imports yet">Files you import will be listed here.</Empty> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>File</th><th>Source</th><th>Imported on</th><th>By</th><th className="num">Rows</th><th className="num">Imported</th><th className="num">Duplicates</th><th className="num">Invalid</th><th /></tr></thead>
              <tbody>
                {history.map((b) => (
                  <tr key={b.id}>
                    <td className="cell-clip" title={b.filename}>{b.filename}</td><td><SourceChip source={b.source} /></td><td className="nowrap">{fmtDateTime(b.at)}</td><td>{b.by || '—'}</td>
                    <td className="num">{b.total.toLocaleString()}</td><td className="num inc-c strong">{b.imported.toLocaleString()}</td>
                    <td className="num">{b.duplicates.toLocaleString()}</td><td className={`num ${b.invalid ? 'exp-c' : ''}`}>{b.invalid.toLocaleString()}</td>
                    <td className="act"><button className="icon-btn" aria-label={`Remove import ${b.filename}`} title="Remove this import" onClick={() => removeBatch(b)}><Trash2 size={16} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {confirm && preview && (
        <Modal title="Import a large file?" onClose={() => setConfirm(false)}
          footer={<><button className="btn" onClick={() => setConfirm(false)}>Cancel</button><button className="btn primary" onClick={doImport}>Yes, import {preview.validRows.toLocaleString()} rows</button></>}>
          <p>You are about to import <strong>{preview.validRows.toLocaleString()}</strong> transactions from <strong>{file?.name}</strong> as <strong>{SRC[src].label}</strong>.</p>
          <p className="muted small" style={{ marginTop: 8 }}>{preview.invalidRows.toLocaleString()} invalid row(s) will be skipped. Rows already imported before are detected and skipped automatically. You can remove this import later from the history list.</p>
        </Modal>
      )}
    </div>
  );
}

function ErrorTable({ errors }: { errors: { row: number; errors: string[]; raw?: Record<string, string> }[] }) {
  return (
    <div className="table-wrap card flush err-list">
      <table className="table">
        <thead><tr><th>CSV row</th><th>Problem</th>{errors[0]?.raw && <th>Row data</th>}</tr></thead>
        <tbody>
          {errors.map((e) => (
            <tr key={e.row}>
              <td className="nowrap strong">{e.row}</td>
              <td>{e.errors.map((m, i) => <div key={i} className="exp-c">{m}</div>)}</td>
              {e.raw && <td className="mono muted cell-clip" title={Object.values(e.raw).join(' | ')}>{Object.values(e.raw).join(' | ')}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
