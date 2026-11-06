import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { translate } from './i18n';
import { Account, PaymentMethod, Transaction } from './lib/types';

interface Store {
  transactions: Transaction[];
  accounts: Account[]; // all, including archived
  activeAccounts: Account[];
  methods: PaymentMethod[]; // all, including archived
  activeMethods: PaymentMethod[];
  accountName: (id: string) => string;
  loading: boolean;
  error: string | null;
  hideBalances: boolean;
  toggleHide: () => void;
  dark: boolean;
  toggleTheme: () => void;
  refresh: () => Promise<void>;
  add: (t: Parameters<typeof api.add>[0]) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

const Ctx = createContext<Store | null>(null);

const ls = {
  get(k: string): string | null {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* ignore */
    }
  },
};

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [transactions, setTx] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hideBalances, setHide] = useState(() => ls.get('hideBalances') === '1');
  const [dark, setDark] = useState(() => {
    const saved = ls.get('theme');
    if (saved) return saved === 'dark';
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  });

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }, [dark]);

  const refresh = useCallback(async () => {
    try {
      const [tx, acc, pm] = await Promise.all([api.list(), api.accounts(), api.methods()]);
      setTx(tx);
      setAccounts(acc);
      setMethods(pm);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : translate('Cillad aan la aqoon'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<Store>(
    () => ({
      transactions,
      accounts,
      activeAccounts: accounts.filter((a) => a.active),
      methods,
      activeMethods: methods.filter((m) => m.active),
      accountName: (id: string) => accounts.find((a) => a.id === id)?.name ?? id,
      loading,
      error,
      hideBalances,
      toggleHide: () =>
        setHide((h) => {
          ls.set('hideBalances', h ? '0' : '1');
          return !h;
        }),
      dark,
      toggleTheme: () =>
        setDark((d) => {
          ls.set('theme', d ? 'light' : 'dark');
          return !d;
        }),
      refresh,
      add: async (t) => {
        await api.add(t);
        await refresh();
      },
      remove: async (id) => {
        await api.remove(id);
        await refresh();
      },
    }),
    [transactions, accounts, methods, loading, error, hideBalances, dark, refresh],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}
