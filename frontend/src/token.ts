// Token storage kept separate from React so api.ts can use it without import cycles.
// "Remember me" → localStorage (survives browser restarts); otherwise sessionStorage.

const KEY = 'auth.token';
const USER = 'auth.user';

export type Role = 'admin' | 'staff';
export interface AuthUser { id: string; username: string; fullName: string; role: Role }

const safe = <T,>(fn: () => T, fallback: T): T => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

/** The storage currently holding the session (or null). */
const holder = (): Storage | null =>
  safe(() => (localStorage.getItem(KEY) ? localStorage : sessionStorage.getItem(KEY) ? sessionStorage : null), null);

export const getToken = (): string | null => safe(() => holder()?.getItem(KEY) ?? null, null);

export const getStoredUser = (): AuthUser | null =>
  safe(() => {
    const raw = holder()?.getItem(USER);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  }, null);

export function saveSession(token: string, user: AuthUser, remember: boolean) {
  clearSession();
  safe(() => {
    const s = remember ? localStorage : sessionStorage;
    s.setItem(KEY, token);
    s.setItem(USER, JSON.stringify(user));
  }, undefined);
}

/** Swap the token (e.g. after a password change) keeping the same storage. */
export function replaceToken(token: string) {
  safe(() => holder()?.setItem(KEY, token), undefined);
}

export function updateStoredUser(user: AuthUser) {
  safe(() => holder()?.setItem(USER, JSON.stringify(user)), undefined);
}

export function clearSession() {
  safe(() => {
    for (const s of [localStorage, sessionStorage]) {
      s.removeItem(KEY);
      s.removeItem(USER);
    }
  }, undefined);
}

let onUnauthorized: (() => void) | null = null;
export const setOnUnauthorized = (fn: (() => void) | null) => {
  onUnauthorized = fn;
};
export const notifyUnauthorized = () => onUnauthorized?.();
