import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/**
 * Tiny i18n: Somali is the source language, so the Somali text itself is the key.
 * English is looked up in EN; anything missing falls back to the Somali text.
 * Placeholders look like {name}.
 */
export type Lang = 'so' | 'en';

const KEY = 'lang';
const readSaved = (): Lang | null => {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'en' || v === 'so' ? v : null;
  } catch {
    return null;
  }
};

let current: Lang = readSaved() ?? 'so';
export const getLang = (): Lang => current;

const EN: Record<string, string> = {
  // ---- navigation / common
  'Guud': 'Home',
  'Guud ahaan': 'General',
  'Dashboard': 'Dashboard',
  'Taariikh': 'History',
  'Xisaab xir': 'Close books',
  'Maamul': 'Administration',
  'Xisaabaha': 'Accounts',
  'Isticmaalayaasha': 'Users',
  'Dejin': 'Settings',
  'Maamule (Admin)': 'Admin',
  'Maamule': 'Admin',
  'Shaqaale': 'Staff',
  'Ka bax': 'Log out',
  'Beddel muuqaalka': 'Toggle theme',
  'Ku dar': 'Add',
  'Xidh': 'Close',
  'Jooji': 'Cancel',
  'Kaydi': 'Save',
  'Waa la kaydinayaa…': 'Saving…',
  'Waa hagaag': 'OK',
  'Cillad': 'Error',
  'Cillad aan la aqoon': 'Unknown error',
  'Server-ka lama gaari karo': 'Cannot reach the server',
  'Isku day mar kale': 'Try again',
  'Luuqadda': 'Language',
  'Kale': 'Other',

  // ---- login
  'Hadhaagga xisaabaha': 'Account balances',
  'Soo gal iyo bixid': 'Income & expenses',
  'Bixidda halka ay aaday': 'Where money went',
  'Taariikhda dhaqdhaqaaqa': 'Transaction history',
  'XISAABTA SHAKHSIGA IYO XAAFADDA': 'PERSONAL & HOUSEHOLD ACCOUNTS',
  'Lacagtaada,': 'Your money,',
  'si fudud u maamul.': 'managed simply.',
  'Ku Soo Dhawoow': 'Welcome back',
  'Gal xisaabtaada si aad u sii wadato.': 'Sign in to your account to continue.',
  'Geli username-kaaga': 'Enter your username',
  'Geli password-kaaga': 'Enter your password',
  'Qari password': 'Hide password',
  'Tus password': 'Show password',
  'I xasuuso (Remember Me)': 'Remember me',
  'Waa la galayaa…': 'Signing in…',
  'Soo Gal (Log In)': 'Log In',

  // ---- add transaction
  'Ku dar dhaqdhaqaaq': 'Add transaction',
  'Soo gashay': 'Income',
  'Baxday': 'Expense',
  'Lacagta ($)': 'Amount ($)',
  'Taariikhda': 'Date',
  'Xisaabta': 'Account',
  'Kuka ka timid': 'Received from',
  'Kuka loo bixiyey': 'Paid to',
  'Magaca qofka / dhinaca': 'Person / party name',
  'Meesha': 'Place',
  'ikhtiyaari': 'optional',
  'Tusaale: Suuq, Guri, Gaadiid': 'e.g. Market, Home, Transport',

  // ---- dashboard
  'Salaan, {name}': 'Hello, {name}',
  'Dooro bisha': 'Select month',
  'Cusboonaysii': 'Refresh',
  'Tus lacagaha': 'Show amounts',
  'Qari lacagaha': 'Hide amounts',
  'Wadarta hadhaagga': 'Total balance',
  'Ilaa dhammaadka {month}': 'Up to the end of {month}',
  'Isbeddelka bisha': 'Net this month',
  'Soo gashay − Baxday': 'Income − Expense',
  'Maamul xisaabaha': 'Manage accounts',
  'Bilow dhaqdhaqaaqaaga ugu horreeya': 'Record your first transaction',
  'Taabo “Ku dar” si aad u darto lacag soo gashay ama bixid.': 'Tap “Add” to record income or an expense.',
  'Soo geli xog tijaabo': 'Load demo data',
  'Bishan ma jirto bixid la diiwaangeliyey.': 'No expenses recorded this month.',
  'Wadarta': 'Total',
  'Dhaqdhaqaaqii ugu dambeeyey': 'Latest transactions',
  'Dhammaan →': 'View all →',

  // ---- history
  '{n} dhaqdhaqaaq': '{n} transactions',
  'Raadi qof, meel, xisaab…': 'Search person, place, account…',
  'Dhammaan xisaabaha': 'All accounts',
  '(xiran)': '(archived)',
  'Dhammaan noocyada': 'All types',
  'Dhammaan bilaha': 'All months',
  'Qofka / Dhinaca': 'Person / Party',
  'Xisaab': 'Account',
  'Nooca': 'Type',
  'Lacagta': 'Amount',
  'Ficil': 'Action',
  'Wadarta liiska': 'List total',
  'Dhaqdhaqaaq lama helin.': 'No transactions found.',
  'Ma tirtirtaa dhaqdhaqaaqan?': 'Delete this transaction?',
  'Tirtir': 'Delete',
  'Diiwaangeliyay': 'Recorded by',

  // ---- close books
  'Xir bisha si hadhaaggu u xaqiijiyo oo aan loo bedelin': 'Close the month to lock its balances',
  'Waxaa xiray': 'Closed by',
  'Bishan weli waa furan tahay': 'This month is still open',
  'Xiran': 'Closed',
  'Furan': 'Open',
  'Dib u fur': 'Reopen',
  'Xir bisha': 'Close month',
  'Waa la soo rarayaa…': 'Loading…',
  'Hadhaagii hore': 'Opening balance',
  'Hadhaagga xiritaanka': 'Closing balance',
  'Maamulaha (Admin) kaliya ayaa xiri kara ama dib u furi kara bisha.': 'Only an admin can close or reopen a month.',
  'Bilihii la xiray': 'Closed months',
  'Bisha': 'Month',
  'La xiray': 'Closed on',
  'Weli bil lama xirin.': 'No months closed yet.',
  'Ma xirtaa {label}? Marka la xiro, dhaqdhaqaaq lagama darin karo, lagamana tirtiri karo bishaas.':
    'Close {label}? Once closed, no transactions can be added or deleted for that month.',
  'Ma dib u furtaa {label}? Dhaqdhaqaaqa bishaas mar kale ayaa la bedeli karaa.':
    'Reopen {label}? Transactions for that month can be changed again.',

  // ---- users
  '{n} isticmaale': '{n} users',
  'Isticmaale cusub': 'New user',
  'Magaca': 'Name',
  'Doorka': 'Role',
  'Xaalad': 'Status',
  'La abuuray': 'Created',
  'Ficillada': 'Actions',
  'Adiga': 'You',
  'Shaqeynaya': 'Active',
  'La xidhay': 'Disabled',
  'Wax ka beddel': 'Edit',
  'Password cusub': 'New password',
  'Fur': 'Enable',
  'Ma xidhaa xisaabta "{u}"?': 'Disable the account "{u}"?',
  'Ma furtaa xisaabta "{u}"?': 'Enable the account "{u}"?',
  'Isticmaale waa la sameeyey': 'User created',
  'Siiso': 'Give',
  'macluumaadkan. Password-ka mar dambe lama arki karo.': 'these details. The password cannot be viewed again later.',
  'Wax ka beddel isticmaale': 'Edit user',
  'Magaca oo buuxa': 'Full name',
  'tusaale: amina': 'e.g. amina',
  'Shaqaale — arki karo oo ku dari karo': 'Staff — can view and add',
  'Maamule — wax walba': 'Admin — everything',
  'Password (ugu yaraan 8 xaraf)': 'Password (at least 8 characters)',
  'Soo saar': 'Generate',
  'Password cusub — {u}': 'New password — {u}',
  'Beddel password-ka': 'Change password',
  'Password-ka waa la beddelay.': 'Password changed.',
  'waa laga saaray meel kasta oo uu ku jiray; waa inuu mar kale galaa. Siiso password-kan:':
    'has been signed out everywhere and must log in again. Share this password:',
  'Password cusub (ugu yaraan 8 xaraf)': 'New password (at least 8 characters)',
  'Koobiyee': 'Copy',
  'Waa la koobiyeeyey': 'Copied',

  // ---- accounts page
  'Abuur xisaab cusub ama magaca ka beddel': 'Create a new account or rename one',
  'Xisaab cusub': 'New account',
  'Hadhaagga': 'Balance',
  'Dhaqdhaqaaq': 'Transactions',
  'Shaqeynaysa': 'Active',
  'Xidhan': 'Archived',
  'Xidh xisaabta': 'Archive',
  'Ma xidhaa xisaabta "{n}"? Waxay ka libdhi doontaa liiska lagu darayo dhaqdhaqaaqa.':
    'Archive the account "{n}"? It will no longer be offered when adding transactions.',
  'Ma tirtirtaa xisaabta "{n}"?': 'Delete the account "{n}"?',
  'Magaca xisaabta waad beddeli kartaa wakhti kasta; dhaqdhaqaaqii hore wuu ku hadhayaa. Xisaab hadhaag leh lama xidhi karo.':
    'You can rename an account at any time; past transactions stay with it. An account with a balance cannot be archived.',
  'Beddel xisaabta': 'Edit account',
  'Magaca xisaabta': 'Account name',
  'tusaale: Bangiga, Kaydka, Mashruuc': 'e.g. Bank, Savings, Project',
  'Astaanta': 'Icon',

  // ---- payment methods
  'Habka lacag-bixinta': 'Payment methods',
  'EVC, Salaam, Dahabshiil iyo kuwa kale': 'EVC, Salaam, Dahabshiil and others',
  'Habka cusub': 'New method',
  'Beddel habka': 'Edit method',
  'Magaca habka': 'Method name',
  'Habka': 'Method',
  'Lambarka': 'Number',
  'Nooca lambarka': 'Number type',
  'Lambarka telefoonka': 'Phone number',
  'Lambarka akoonka': 'Account number',
  'bangi': 'bank',
  'Ma xidhaa habka "{n}"? Dhaqdhaqaaqa cusub looma dooran karo.': 'Archive the method "{n}"? It can no longer be chosen for new transactions.',
  'Ma tirtirtaa habka "{n}"?': 'Delete the method "{n}"?',
  'Habka waxaa loo isticmaalaa marka lacag la helo ama la bixiyo, waxaana la diiwaangeliyaa lambarka telefoonka ama akoonka. Ku xidh haddii aadan u baahnayn.':
    'A method is used when money is received or paid, and the phone or account number is recorded. Archive one you no longer need.',
  'Lacagta ku soo gashay (EVC, Salaam…)': 'Received via (EVC, Salaam…)',
  'Lacagta laga bixiyey (EVC, Salaam…)': 'Paid from (EVC, Salaam…)',
  'Ma jiro': 'None',
  'Lambarka telefoonka ee lacagta ku dhacday': 'Phone number the money arrived on',
  'Lambarka akoonka ee lacagta ku dhacday': 'Account number the money arrived in',
  'Lambarka telefoonka laga bixiyey': 'Phone number paid from',
  'Lambarka akoonka laga bixiyey': 'Account number paid from',
  'tusaale: 061xxxxxxx': 'e.g. 061xxxxxxx',
  'tusaale: lambarka akoonka': 'e.g. the account number',

  // ---- saved numbers
  'Lambarada': 'Numbers',
  'Lambarada la kaydiyey': 'Saved numbers',
  'Weli lambar lama kaydin': 'No numbers saved yet',
  'Magac (ikhtiyaari)': 'Label (optional)',
  'Ku dar lambar': 'Add number',
  'Lambarada ayaa lagu dooran karaa marka dhaqdhaqaaq la darayo.': 'These numbers can be picked when adding a transaction.',
  'Tirtir lambarka "{n}"?': 'Delete the number "{n}"?',
  '+{n} kale': '+{n} more',
  'Lambar cusub': 'New number',
  'tusaale: 615595050': 'e.g. 615595050',

  // ---- settings
  'Xisaabtaada iyo doorashooyinka': 'Your account and preferences',
  'Maamul xisaabaha →': 'Manage accounts →',
  'Maamul isticmaalayaasha →': 'Manage users →',
  'Muuqaalka': 'Appearance',
  'Muuqaalka madow (Dark mode)': 'Dark mode',
  'Qari lacagaha Dashboard-ka': 'Hide amounts on the Dashboard',
  'Password-ka hadda': 'Current password',
  'Ku celi': 'Confirm',
  'Kaydi password-ka': 'Save password',
  'Password-ada isma mid ahan': 'Passwords do not match',
  'Password-ka waa la beddelay': 'Password changed',
  'Xogta (Admin)': 'Data (Admin)',
  'Qalabkan waxaa loogu talagalay tijaabo. Waxay saameeyaan xogta dhammaan isticmaalayaasha.':
    'These tools are for testing. They affect all users’ data.',
  'Xogta tijaabada waa la geliyey': 'Demo data loaded',
  'Tirtir dhammaan dhaqdhaqaaqa': 'Delete all transactions',
  'Dhammaan dhaqdhaqaaqa waa la tirtiri doonaa. Sii wad?': 'All transactions will be deleted. Continue?',
  'Dhammaan waa la tirtiray': 'Everything deleted',
};

const MONTHS_SO = ['Janaayo', 'Febraayo', 'Maarso', 'Abriil', 'Maajo', 'Juun', 'Luuliyo', 'Ogosto', 'Sebtembar', 'Oktoobar', 'Nofembar', 'Desembar'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const monthName = (i: number): string => (current === 'en' ? MONTHS_EN : MONTHS_SO)[i];
export const shortMonthName = (i: number): string => monthName(i).slice(0, 3);

/** Translate outside React (api layer, helpers). */
export function translate(s: string, vars?: Record<string, string | number>): string {
  let out = current === 'en' ? EN[s] ?? s : s;
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
  return out;
}

interface Ctx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: typeof translate;
  /** Places are user data; only the built-in default "Kale" is translated. */
  place: (p: string) => string;
}
const LangCtx = createContext<Ctx>({ lang: current, setLang: () => {}, t: translate, place: (p) => p });

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(current);

  const setLang = useCallback((l: Lang) => {
    current = l; // update before re-render so every translate() call sees it
    try { localStorage.setItem(KEY, l); } catch { /* ignore */ }
    setLangState(l);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo<Ctx>(
    () => ({ lang, setLang, t: translate, place: (p) => (p === 'Kale' ? translate('Kale') : p) }),
    [lang, setLang],
  );
  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>;
}

export const useLang = () => useContext(LangCtx);

/** Compact "SO | EN" switch. */
export function LangToggle({ className = '' }: { className?: string }) {
  const { lang, setLang } = useLang();
  return (
    <div className={`lang-toggle ${className}`} role="group" aria-label="Language / Luuqadda">
      <button type="button" className={lang === 'so' ? 'on' : ''} aria-pressed={lang === 'so'} onClick={() => setLang('so')}>SO</button>
      <button type="button" className={lang === 'en' ? 'on' : ''} aria-pressed={lang === 'en'} onClick={() => setLang('en')}>EN</button>
    </div>
  );
}
