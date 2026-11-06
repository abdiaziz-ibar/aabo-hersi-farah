import { Account, ClosingPreview, ClosingRecord, PaymentMethod, SavedNumber, Transaction, UserRow } from './lib/types';
import { getLang, translate } from './i18n';
import { AuthUser, getToken, notifyUnauthorized } from './token';

type NewTx = Omit<Transaction, 'id' | 'date' | 'createdBy' | 'methodName'> & { date?: string };
export interface NewUser { username: string; fullName: string; password: string; role: 'admin' | 'staff' }

const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`${BASE}/api${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'X-Lang': getLang(),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch {
    throw new Error(translate('Server-ka lama gaari karo'));
  }
  if (!res.ok) {
    let msg = res.statusText;
    try {
      msg = (await res.json()).error ?? msg;
    } catch {
      /* no body */
    }
    // An expired/revoked session on a protected call → force logout.
    if (res.status === 401 && token && path !== '/auth/login') notifyUnauthorized();
    throw new Error(msg);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const api = {
  // auth
  login: (username: string, password: string, remember: boolean) =>
    req<{ token: string; user: AuthUser }>('/auth/login', json('POST', { username, password, remember })),
  me: () => req<{ user: AuthUser }>('/auth/me'),
  changePassword: (current: string, next: string) =>
    req<{ token: string }>('/auth/change-password', json('POST', { current, next })),

  // transactions
  list: () => req<Transaction[]>('/transactions'),
  add: (t: NewTx) => req<Transaction>('/transactions', json('POST', t)),
  bulk: (items: NewTx[]) => req<{ inserted: number }>('/transactions/bulk', json('POST', items)),
  remove: (id: string) => req<void>(`/transactions/${id}`, json('DELETE')),
  clear: () => req<void>('/transactions', json('DELETE')),

  // users (admin)
  users: () => req<UserRow[]>('/users'),
  createUser: (u: NewUser) => req<UserRow>('/users', json('POST', u)),
  updateUser: (id: string, patch: Partial<Pick<UserRow, 'fullName' | 'role' | 'active'>>) =>
    req<UserRow>(`/users/${id}`, json('PATCH', patch)),
  resetPassword: (id: string, password: string) =>
    req<void>(`/users/${id}/reset-password`, json('POST', { password })),

  // accounts
  accounts: () => req<Account[]>('/accounts'),
  createAccount: (a: { name: string; icon: string }) => req<Account>('/accounts', json('POST', a)),
  updateAccount: (id: string, patch: Partial<Pick<Account, 'name' | 'icon' | 'active'>>) =>
    req<Account>(`/accounts/${id}`, json('PATCH', patch)),
  deleteAccount: (id: string) => req<void>(`/accounts/${id}`, json('DELETE')),

  // payment methods
  methods: () => req<PaymentMethod[]>('/methods'),
  createMethod: (m: { name: string; kind: PaymentMethod['kind'] }) => req<Omit<PaymentMethod, 'numbers'> & { numbers?: SavedNumber[] }>('/methods', json('POST', m)),
  updateMethod: (id: string, patch: Partial<Pick<PaymentMethod, 'name' | 'kind' | 'active'>>) =>
    req<PaymentMethod>(`/methods/${id}`, json('PATCH', patch)),
  deleteMethod: (id: string) => req<void>(`/methods/${id}`, json('DELETE')),
  addMethodNumber: (id: string, n: { number: string; label: string }) =>
    req<SavedNumber>(`/methods/${id}/numbers`, json('POST', n)),
  deleteMethodNumber: (id: string, nid: string) => req<void>(`/methods/${id}/numbers/${nid}`, json('DELETE')),

  // accounting periods
  closings: () => req<ClosingRecord[]>('/closings'),
  closingPreview: (year: number, month: number) =>
    req<ClosingPreview>(`/closings/preview?year=${year}&month=${month}`),
  closeMonth: (year: number, month: number) => req<ClosingRecord>('/closings', json('POST', { year, month })),
  reopenMonth: (year: number, month: number) => req<void>(`/closings/${year}/${month}`, json('DELETE')),
};
