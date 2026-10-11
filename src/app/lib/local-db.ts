'use client';

/**
 * A tiny localStorage-backed mock database.
 * Mimics just enough of the Firestore "accounts" collection shape so the
 * app can run fully offline with zero Firebase project/config required.
 */

export interface Account {
  kitId: string;
  registrationCode: string;
  name: string;
  registered: boolean;
  secret?: string | null;
  recoveryKeys?: string[];
  // Whether this KIT ID is currently allowed to log in. Defaults to true
  // for any account created before this field existed (see isAccountActive).
  active?: boolean;
}

// Older accounts saved before the `active` field existed won't have it set —
// treat those as active so nobody gets locked out unexpectedly.
export function isAccountActive(account: Account): boolean {
  return account.active !== false;
}

import { remoteRead, remoteWrite } from './remote-kv';

const STORAGE_KEY = 'data_vault_accounts';

async function readAll(): Promise<Record<string, Account>> {
  return remoteRead<Record<string, Account>>(STORAGE_KEY, {});
}

async function writeAll(accounts: Record<string, Account>): Promise<void> {
  await remoteWrite(STORAGE_KEY, accounts);
}

// Small artificial delay so loading spinners still feel real, without ever hanging.
const tick = () => new Promise((res) => setTimeout(res, 300));

export async function getAccount(kitId: string): Promise<Account | null> {
  await tick();
  const accounts = await readAll();
  return accounts[kitId.toUpperCase()] ?? null;
}

export async function setAccount(kitId: string, data: Account): Promise<void> {
  await tick();
  const accounts = await readAll();
  accounts[kitId.toUpperCase()] = data;
  await writeAll(accounts);
}

export async function updateAccount(kitId: string, patch: Partial<Account>): Promise<void> {
  await tick();
  const accounts = await readAll();
  const existing = accounts[kitId.toUpperCase()];
  if (!existing) throw new Error('Account not found');
  accounts[kitId.toUpperCase()] = { ...existing, ...patch };
  await writeAll(accounts);
}

export async function seedDemoAccounts(): Promise<void> {
  await tick();
  const demoAccounts: Account[] = [
    { kitId: 'K12345', registrationCode: 'ABCD-1234', name: 'Alex Johnson', registered: false, active: true },
    { kitId: 'K98765', registrationCode: 'WXYZ-5678', name: 'Sarah Smith', registered: false, active: true },
  ];
  const accounts = await readAll();
  for (const account of demoAccounts) {
    // Only add if missing, so a registered demo account isn't reset on every visit.
    if (!accounts[account.kitId]) accounts[account.kitId] = account;
  }
  await writeAll(accounts);
}

export async function getAllAccounts(): Promise<Account[]> {
  await tick();
  return Object.values(await readAll());
}

// Activate or deactivate a KIT ID. Deactivating only blocks that KIT ID's
// owner from logging in — admins can still upload/manage documents for it.
export async function setAccountActive(kitId: string, active: boolean): Promise<void> {
  await updateAccount(kitId, { active });
}

// --- Logged-in user session (which KIT ID is currently signed in) ---

const USER_SESSION_KEY = 'data_vault_user_session';

export function setUserSession(kitId: string, name: string) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(USER_SESSION_KEY, JSON.stringify({ kitId: kitId.toUpperCase(), name }));
}

export function getUserSession(): { kitId: string; name: string } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(USER_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearUserSession() {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(USER_SESSION_KEY);
}
