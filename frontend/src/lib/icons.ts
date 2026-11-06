import { Briefcase, Home, Landmark, LucideIcon, PiggyBank, User, Wallet } from 'lucide-react';

export const ACCOUNT_ICONS: Record<string, LucideIcon> = {
  wallet: Wallet,
  home: Home,
  person: User,
  briefcase: Briefcase,
  landmark: Landmark,
  'piggy-bank': PiggyBank,
};

export const iconFor = (name: string): LucideIcon => ACCOUNT_ICONS[name] ?? Wallet;
