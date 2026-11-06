import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { makeSample } from '../data/sample';
import { Transaction } from '../data/types';
import { load, save } from '../lib/storage';

interface Store {
  ready: boolean;
  transactions: Transaction[];
  hideBalances: boolean;
  toggleHide: () => void;
  addTransaction: (t: Omit<Transaction, 'id' | 'date'> & { date?: string }) => void;
  loadSample: () => void;
  clearAll: () => void;
  reload: () => Promise<void>;
}

const Ctx = createContext<Store | null>(null);
const TX_KEY = 'tx.v1';
const HIDE_KEY = 'ui.hideBalances';

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [transactions, setTx] = useState<Transaction[]>([]);
  const [hideBalances, setHide] = useState(false);

  const reload = useCallback(async () => {
    const saved = await load<Transaction[] | null>(TX_KEY, null);
    if (saved === null) {
      // first launch: start with demo data so the dashboard has something to show
      const sample = makeSample();
      setTx(sample);
      save(TX_KEY, sample);
    } else {
      setTx(saved);
    }
    setHide(await load(HIDE_KEY, false));
  }, []);

  useEffect(() => {
    reload().finally(() => setReady(true));
  }, [reload]);

  const persist = useCallback((next: Transaction[]) => {
    setTx(next);
    save(TX_KEY, next);
  }, []);

  const value = useMemo<Store>(
    () => ({
      ready,
      transactions,
      hideBalances,
      toggleHide: () =>
        setHide((h) => {
          save(HIDE_KEY, !h);
          return !h;
        }),
      addTransaction: (t) =>
        persist([
          { ...t, id: `t${Date.now()}`, date: t.date ?? new Date().toISOString() },
          ...transactions,
        ]),
      loadSample: () => persist(makeSample()),
      clearAll: () => persist([]),
      reload,
    }),
    [ready, transactions, hideBalances, persist, reload],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}
