import { getToken, notifyUnauthorized } from '../token';

/** API client for the Financial Transactions module (EVC Plus / Salaam Bank). */
const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
const ROOT = `${BASE}/api/financial-transactions`;

export type Source = 'EVC_PLUS' | 'SALAAM_BANK';
export type TxKind = 'SENT' | 'RECEIVED' | 'TRANSFER';
export const SOURCE_LABEL: Record<Source, string> = { EVC_PLUS: 'EVC Plus', SALAAM_BANK: 'Salaam Bank' };

export interface FinTx {
  id: string; source: Source; transaction_id: string | null; transaction_date: string;
  sender_name: string | null; sender_phone: string | null; receiver_name: string | null; receiver_phone: string | null;
  amount: number; currency: string; transaction_type: TxKind; description: string | null; reference_number: string | null;
}
export interface TxPage {
  rows: FinTx[]; total: number; page: number; pageSize: number; pages: number;
  summary: { currency: string; count: number; volume: number }[];
}
export interface CurrencyTotals { currency: string; count: number; received: number; sent: number; transfers: number; net: number }
export interface CustomerHit {
  key: string; name: string | null; phone: string | null; count: number; firstAt: string | null; lastAt: string | null; totals: CurrencyTotals[];
}
export interface CustomerProfile {
  key: string; name: string | null; otherNames: string[]; phone: string | null; count: number; firstAt: string; lastAt: string;
  totals: CurrencyTotals[]; bySource: (CurrencyTotals & { source: Source })[];
}
export interface Filters {
  name?: string; phone?: string; exact?: boolean; txId?: string; source?: string; type?: string;
  from?: string; to?: string; minAmount?: string; maxAmount?: string; currency?: string;
  page?: number; pageSize?: number; sort?: string; dir?: string; period?: string; limit?: number;
}
export interface PreviewResult {
  source: Source; filename: string; encoding: string; delimiter: string; headers: string[];
  totalRows: number; validRows: number; invalidRows: number;
  mapping: Record<string, string>; suggestedMapping: Record<string, string>;
  sample: { row: number; cells: Record<string, string> }[];
  errors: { row: number; errors: string[]; raw: Record<string, string> }[];
  parsedSample: Record<string, string | number | null>[];
}
export interface ImportResult {
  batchId: string; total: number; imported: number; duplicates: number; invalid: number; errors: { row: number; errors: string[] }[];
}
export interface Batch {
  id: string; source: Source; filename: string; encoding: string | null; delimiter: string | null;
  total: number; imported: number; duplicates: number; invalid: number; by: string; at: string;
}
export interface SeriesRow { period: string; count: number; volume: number; received: number; sent: number; transfers: number }
export interface SourceRow extends Omit<SeriesRow, 'period'> { source: Source; average: number; largest: number; phones: number; firstAt: string; lastAt: string }
export interface Summary {
  currency: string | null; currencies: string[]; period: string;
  totals: Omit<SeriesRow, 'period'> | null; series: SeriesRow[]; sources: SourceRow[];
}
export interface Top { key?: string; name: string | null; phone: string | null; count: number; total: number }
export interface TopCustomers { currency: string | null; currencies: string[]; topSenders: Top[]; topReceivers: Top[]; activePhones: Top[] }
export interface Meta { total: number; firstAt: string | null; lastAt: string | null; sources: { source: Source; currency: string; count: number }[]; currencies: string[] }

function qs(p: Filters = {}): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) {
    if (v === undefined || v === null || v === '' || v === false) continue;
    u.set(k, String(v));
  }
  const s = u.toString();
  return s ? `?${s}` : '';
}

async function fail(res: Response, token: string | null): Promise<never> {
  let msg = res.statusText || 'Request failed';
  try { msg = (await res.json()).error ?? msg; } catch { /* no body */ }
  if (res.status === 401 && token) notifyUnauthorized();
  throw new Error(msg);
}

async function get<T>(path: string, p?: Filters): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`${ROOT}${path}${qs(p)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  } catch {
    throw new Error('Cannot reach the server');
  }
  if (!res.ok) return fail(res, token);
  return res.json() as Promise<T>;
}

/** Download a file endpoint (CSV / XLSX) with the JWT, then hand it to the browser. */
export async function download(path: string, p: Filters, fallbackName: string): Promise<void> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`${ROOT}${path}${qs(p)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  } catch {
    throw new Error('Cannot reach the server');
  }
  if (!res.ok) return fail(res, token);
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? fallbackName;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(await res.blob());
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/** multipart upload with upload-progress events (fetch cannot report progress). */
function upload<T>(path: string, file: File, fields: Record<string, unknown>, onProgress?: (pct: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append('file', file);
    for (const [k, v] of Object.entries(fields)) fd.append(k, typeof v === 'string' ? v : JSON.stringify(v));
    const xhr = new XMLHttpRequest();
    const token = getToken();
    xhr.open('POST', `${ROOT}${path}`);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onerror = () => reject(new Error('Cannot reach the server'));
    xhr.onload = () => {
      let body: { error?: string } | T = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* not json */ }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(body as T);
      if (xhr.status === 401 && token) notifyUnauthorized();
      reject(new Error((body as { error?: string }).error ?? `Upload failed (${xhr.status})`));
    };
    xhr.send(fd);
  });
}

export const finApi = {
  meta: () => get<Meta>('/meta'),
  search: (p: Filters) => get<{ customers: CustomerHit[]; transactions: TxPage }>('/search', p),
  customer: (key: string, p: Filters) => get<{ profile: CustomerProfile; transactions: TxPage }>(`/customer/${encodeURIComponent(key)}`, p),
  summary: (p: Filters) => get<Summary>('/reports/summary', p),
  top: (p: Filters) => get<TopCustomers>('/reports/top-customers', p),
  batches: () => get<Batch[]>('/batches'),
  deleteBatch: async (id: string) => {
    const token = getToken();
    const res = await fetch(`${ROOT}/batches/${id}`, { method: 'DELETE', headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) await fail(res, token);
  },
  preview: (src: 'evc' | 'salaam', file: File, mapping: Record<string, string> | null, options: Record<string, unknown>) =>
    upload<PreviewResult>(`/import/${src}/preview`, file, { mapping: mapping ?? {}, options }),
  commit: (src: 'evc' | 'salaam', file: File, mapping: Record<string, string>, options: Record<string, unknown>, onProgress: (n: number) => void) =>
    upload<ImportResult>(`/import/${src}`, file, { mapping, options }, onProgress),
  exportTx: (p: Filters, format: 'csv' | 'xlsx') => download('/export', { ...p, format } as Filters, `transactions.${format}`),
  exportCustomer: (key: string, p: Filters, format: 'csv' | 'xlsx') => download(`/customer/${encodeURIComponent(key)}/export`, { ...p, format } as Filters, `customer.${format}`),
  exportReport: (report: string, p: Filters, format: 'csv' | 'xlsx') => download('/reports/export', { ...p, report, format } as Filters, `report.${format}`),
};

/* ---------- display helpers ---------- */
export const fmtMoney = (n: number, currency = 'USD') =>
  `${n < 0 ? '-' : ''}${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(n))} ${currency}`;
export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { timeZone: 'Africa/Mogadishu', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Africa/Mogadishu', day: '2-digit', month: 'short', year: 'numeric' });
export const partyKey = (phone: string | null, name: string | null) => (phone ? `p:${phone}` : name ? `n:${name.toLowerCase()}` : null);
export const prettyPhone = (p: string | null) => (p ? `+${p}` : '');
