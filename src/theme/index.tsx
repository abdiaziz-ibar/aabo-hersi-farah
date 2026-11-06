import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { load, save } from '../lib/storage';

export interface Colors {
  bg: string;
  card: string;
  text: string;
  sub: string;
  border: string;
  primary: string;
  gradient: [string, string];
  income: string;
  expense: string;
  incomeTint: string;
  expenseTint: string;
  chart: string[];
}

const light: Colors = {
  bg: '#F4F6FA',
  card: '#FFFFFF',
  text: '#0F172A',
  sub: '#64748B',
  border: '#E5E9F0',
  primary: '#4F46E5',
  gradient: ['#4F46E5', '#7C3AED'],
  income: '#16A34A',
  expense: '#DC2626',
  incomeTint: 'rgba(22,163,74,0.12)',
  expenseTint: 'rgba(220,38,38,0.12)',
  chart: ['#6366F1', '#F59E0B', '#EC4899', '#94A3B8'],
};

const dark: Colors = {
  bg: '#0B1020',
  card: '#151B2E',
  text: '#F1F5F9',
  sub: '#94A3B8',
  border: '#232B42',
  primary: '#818CF8',
  gradient: ['#3730A3', '#5B21B6'],
  income: '#4ADE80',
  expense: '#F87171',
  incomeTint: 'rgba(74,222,128,0.14)',
  expenseTint: 'rgba(248,113,113,0.14)',
  chart: ['#818CF8', '#FBBF24', '#F472B6', '#64748B'],
};

type Mode = 'light' | 'dark';
interface ThemeCtx { mode: Mode; colors: Colors; toggle: () => void }

const Ctx = createContext<ThemeCtx>({ mode: 'light', colors: light, toggle: () => {} });
const KEY = 'theme.mode';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [override, setOverride] = useState<Mode | null>(null);

  useEffect(() => {
    load<Mode | null>(KEY, null).then(setOverride);
  }, []);

  const mode: Mode = override ?? (system === 'dark' ? 'dark' : 'light');
  const toggle = useCallback(() => {
    const next: Mode = mode === 'dark' ? 'light' : 'dark';
    setOverride(next);
    save(KEY, next);
  }, [mode]);

  const value = useMemo(
    () => ({ mode, colors: mode === 'dark' ? dark : light, toggle }),
    [mode, toggle],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
