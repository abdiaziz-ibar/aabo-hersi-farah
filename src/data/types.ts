export type AccountId = 'saadicuun' | 'xaafada' | 'shakhsi';
export type TxType = 'income' | 'expense';

export interface Account {
  id: AccountId;
  name: string;
  icon: 'wallet' | 'home' | 'person';
}

export interface Transaction {
  id: string;
  type: TxType;
  amount: number;
  accountId: AccountId;
  party: string; // who the money came from / went to
  place: string; // "Meesha"
  date: string; // ISO
}

export const ACCOUNTS: Account[] = [
  { id: 'saadicuun', name: 'Saadicuun', icon: 'wallet' },
  { id: 'xaafada', name: 'Xaafada', icon: 'home' },
  { id: 'shakhsi', name: 'Shakhsi', icon: 'person' },
];

export const accountName = (id: AccountId) =>
  ACCOUNTS.find((a) => a.id === id)?.name ?? id;
