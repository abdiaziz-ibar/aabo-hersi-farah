import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import {
  AuthUser, clearSession, getStoredUser, getToken, replaceToken, saveSession, setOnUnauthorized, updateStoredUser,
} from './token';

interface Auth {
  user: AuthUser | null;
  isAdmin: boolean;
  login: (username: string, password: string, remember: boolean) => Promise<void>;
  logout: () => void;
  changePassword: (current: string, next: string) => Promise<void>;
}

const Ctx = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => (getToken() ? getStoredUser() : null));

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

  useEffect(() => {
    setOnUnauthorized(logout);
    return () => setOnUnauthorized(null);
  }, [logout]);

  // Re-validate the session on load so role changes / disabled accounts take effect.
  useEffect(() => {
    if (!getToken()) return;
    api.me().then(({ user: u }) => {
      updateStoredUser(u);
      setUser(u);
    }).catch(() => { /* 401 handled by notifyUnauthorized; network errors keep the session */ });
  }, []);

  const login = useCallback(async (username: string, password: string, remember: boolean) => {
    const { token, user: u } = await api.login(username, password, remember);
    saveSession(token, u, remember);
    setUser(u);
  }, []);

  const changePassword = useCallback(async (current: string, next: string) => {
    const { token } = await api.changePassword(current, next);
    replaceToken(token);
  }, []);

  const value = useMemo(
    () => ({ user, isAdmin: user?.role === 'admin', login, logout, changePassword }),
    [user, login, logout, changePassword],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): Auth {
  const a = useContext(Ctx);
  if (!a) throw new Error('useAuth outside AuthProvider');
  return a;
}
