'use client';

import { ApiError, apiFetch } from './api';
import { clearAdminDisplayCache } from './admin-session-cache';

export interface AdminSession {
  email: string;
  name: string;
}

// For calls that need an admin session. A 401 means the session expired or the
// account was disabled, so send them to log in again instead of leaving the
// page open and showing empty lists as if there were no data.
async function adminFetch<T>(path: string, options?: Parameters<typeof apiFetch>[1]): Promise<T> {
  try {
    return await apiFetch<T>(path, options);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      clearAdminDisplayCache();
      window.location.assign('/admin/login?expired=1');
    }
    throw e;
  }
}

// POST /api/admin/auth/login — sets the admin session cookie on success
export function adminLogin(email: string, password: string): Promise<AdminSession> {
  return apiFetch<AdminSession>('/api/admin/auth/login', {
    method: 'POST',
    body: { email, password },
  });
}

// POST /api/admin/auth/logout — clears the admin session cookie
export function adminLogout(): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>('/api/admin/auth/logout', { method: 'POST' });
}

// POST /api/admin/invites — superadmin-only (backend 403s otherwise).
// New accounts always get a lowercase email because the backend matches emails
// case-sensitively: inviting Jane@x.com would stop jane@x.com from logging in.
export function createInvite(email: string): Promise<{ email: string; token: string; expiresAt: string }> {
  return adminFetch('/api/admin/invites', { method: 'POST', body: { email: email.trim().toLowerCase() } });
}

// The token goes in the URL fragment, which browsers never send to a server,
// so it stays out of server logs. The accept page clears it after reading it.
export function buildInviteLink(origin: string, email: string, token: string): string {
  const params = new URLSearchParams({ email, token });
  return `${origin}/admin/invites/accept#${params.toString()}`;
}

// POST /api/admin/invites/accept — new admin sets name + password, gets the 'admin' role
export function acceptInvite(email: string, token: string, password: string, name: string): Promise<AdminSession> {
  return apiFetch<AdminSession>('/api/admin/invites/accept', {
    method: 'POST',
    body: { email, token, password, name },
  });
}

// POST /api/admin/profile — any admin can update their own display name
export function updateAdminProfile(name: string): Promise<AdminSession> {
  return adminFetch<AdminSession>('/api/admin/profile', { method: 'POST', body: { name } });
}

// GET /api/admin/admins — superadmins get everyone, other admins get only themselves.
// Mirrors the real `admins` table exactly: no password, matches backend vocabulary.
export interface AdminSummary {
  email: string;
  name: string;
  role: 'superadmin' | 'admin';
  active: boolean;
  created_at: string; // ISO timestamp from the backend
}
export async function listAdmins(): Promise<AdminSummary[]> {
  return (await adminFetch<AdminSummary[] | null>('/api/admin/admins')) ?? [];
}

// GET /api/admin/members — any active admin can call this (read-only).
// Mirrors the real `members` table exactly: just kitId + registered + created_at.
// NOTE: no `name` field — members are pseudonymous by design, the backend never
// stores one. No `active`/deactivate flag yet either, that isn't built on the
// backend. The backend sends null, not [], when there are no members.
export interface MemberSummary {
  kitId: string;
  registered: boolean;
  created_at: string; // ISO timestamp from the backend
}
export async function listMembers(): Promise<MemberSummary[]> {
  return (await adminFetch<MemberSummary[] | null>('/api/admin/members')) ?? [];
}

// POST /api/admin/provision — generates new member KIT IDs + their one-time keys.
// The backend returns one flat recoveryKeys list per member: index 0 is the
// signup key, the rest are recovery keys. It rejects each key type where the
// other is expected, so splitProvisionedKeys is the one place that knows this order.
export interface ProvisionedMember {
  kitId: string;
  recoveryKeys: string[];
}
export function provisionMembers(count: number): Promise<{ members: ProvisionedMember[] }> {
  return adminFetch('/api/admin/provision', { method: 'POST', body: { count } });
}
export function splitProvisionedKeys(member: ProvisionedMember): { signupKey: string; recoveryKeys: string[] } {
  const [signupKey, ...recoveryKeys] = member.recoveryKeys;
  return { signupKey, recoveryKeys };
}

// POST /api/admin/ingest — CSV upload for a given member's records (multipart form).
// The original filename is sent on purpose: the backend rejects any file not
// named <kitId>.csv, which stops one person's records going to another member.
export function ingestCsv(kitId: string, file: File): Promise<{ batchId: string; rowCount: number }> {
  const form = new FormData();
  form.append('kitId', kitId);
  form.append('file', file);
  return adminFetch('/api/admin/ingest', { method: 'POST', body: form });
}

// Generate more recovery keys for an existing member (1-10 at a time).
// Same response shape as provisioning, but every key here is a recovery key.
export function topUpRecoveryKeys(kitId: string, count: number): Promise<ProvisionedMember> {
  return adminFetch<ProvisionedMember>(`/api/admin/members/${encodeURIComponent(kitId)}/recovery-keys`, {
    method: 'POST',
    body: { count },
  });
}
