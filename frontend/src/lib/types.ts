export type AccountId = string;
export type TxType = 'income' | 'expense';

export interface Account {
  id: AccountId;
  name: string;
  icon: string;
  active: boolean;
}

export interface Transaction {
  id: string;
  type: TxType;
  amount: number;
  accountId: AccountId;
  party: string; // who the money came from / went to
  place: string; // "Meesha"
  date: string; // ISO
  createdBy?: string | null;
  methodId?: string | null; // EVC, Salaam, ...
  methodName?: string | null;
  methodNumber?: string | null; // phone / account number used
}

export interface PaymentMethod {
  id: string;
  name: string;
  kind: 'phone' | 'account';
  active: boolean;
  numbers: SavedNumber[];
}

export interface SavedNumber {
  id: string;
  number: string;
  label: string;
}

export interface UserRow {
  id: string;
  username: string;
  fullName: string;
  role: 'admin' | 'staff';
  active: boolean;
  locked?: boolean; // too many wrong passwords; an admin must unlock
  failedAttempts?: number;
  createdAt?: string;
}

export interface BlockEntry {
  kind: 'name' | 'ip';
  key: string;
  failed: number;
  blockedAt: string;
  expiresInMinutes: number | null;
}

export interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  action: string;
  target: string;
  detail: string;
  ip: string;
}

export interface AccountFigures { opening: number; income: number; expense: number; closing: number }
export interface Summary {
  accounts: Record<string, AccountFigures>;
  totals: AccountFigures;
}
export interface ClosingRecord {
  year: number;
  month: number; // 1-12
  closedAt: string;
  closedBy: string | null;
  snapshot: Summary;
}
export interface ClosingPreview extends Summary {
  year: number;
  month: number;
  closing: ClosingRecord | null;
}
