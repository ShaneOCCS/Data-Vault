'use client';

/**
 * A tiny localStorage-backed mock "admins" table.
 * Mirrors the pattern in local-db.ts — no real backend yet.
 * Swap this out for real Firebase Auth / Firestore rules later.
 */

export interface Admin {
  email: string;
  password: string; // NOTE: plaintext, mock-only. Never do this with a real backend.
  name: string;
}

import { remoteRead, remoteWrite } from './remote-kv';

const STORAGE_KEY = 'data_vault_admins';
const SESSION_KEY = 'data_vault_admin_session';

async function readAll(): Promise<Record<string, Admin>> {
  return remoteRead<Record<string, Admin>>(STORAGE_KEY, {});
}

async function writeAll(admins: Record<string, Admin>): Promise<void> {
  await remoteWrite(STORAGE_KEY, admins);
}

const tick = () => new Promise((res) => setTimeout(res, 300));

export async function seedDemoAdmins(): Promise<void> {
  await tick();
  const demoAdmins: Admin[] = [
    { email: 'admin@gmail.com', password: 'Admin123!', name: 'Vault Admin' },
  ];
  const admins = await readAll();
  for (const admin of demoAdmins) {
    // Only add if missing, so a changed password isn't reset on every visit.
    if (!admins[admin.email.toLowerCase()]) admins[admin.email.toLowerCase()] = admin;
  }
  await writeAll(admins);
}

export async function getAllAdmins(): Promise<Admin[]> {
  await tick();
  return Object.values(await readAll());
}

export async function addAdmin(admin: Admin): Promise<{ ok: boolean; error?: string }> {
  await tick();
  const admins = await readAll();
  const key = admin.email.toLowerCase();
  if (admins[key]) {
    return { ok: false, error: 'An admin with that email already exists.' };
  }
  admins[key] = admin;
  await writeAll(admins);
  return { ok: true };
}

export async function removeAdmin(email: string): Promise<void> {
  await tick();
  const admins = await readAll();
  delete admins[email.toLowerCase()];
  await writeAll(admins);
}

export async function verifyAdminLogin(email: string, password: string): Promise<Admin | null> {
  await tick();
  const admins = await readAll();
  const admin = admins[email.toLowerCase()];
  if (admin && admin.password === password) {
    return admin;
  }
  return null;
}

export function setAdminSession(admin: Admin) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ email: admin.email, name: admin.name }));
}

export function getAdminSession(): { email: string; name: string } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearAdminSession() {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(SESSION_KEY);
}
