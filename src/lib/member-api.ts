'use client';

// Client for the real Medical Vault Go backend's MEMBER-facing auth endpoints
// (registration/onboarding, login, recovery, logout). Same pattern as
// admin-api.ts: every call goes through apiFetch() so credentials/error
// handling are set once. Added when wiring the real registration flow — see
// RegistrationFlow.tsx for where these get used.

import { apiFetch } from './api';

export interface OnboardBeginResponse {
  otpauthUrl: string;
}

// Starts registration: validates the KIT ID + one-time signup key (minted by
// an admin at provisioning), and has the server generate a fresh TOTP secret
// for this member. Returns the otpauth:// URL to render as a QR code — the
// secret is only ever seen by this response and the QR drawn from it.
export function onboardBegin(kitId: string, signupKey: string): Promise<OnboardBeginResponse> {
  return apiFetch<OnboardBeginResponse>('/api/onboard/begin', {
    method: 'POST',
    // backend's field is named recoveryKey even for the signup-purpose key —
    // signup and recovery keys are both rows in the same recovery_keys table,
    // distinguished only by a "purpose" column
    body: { kitId, recoveryKey: signupKey },
  });
}

export interface SessionResponse {
  kitId: string;
}

// Confirms the member can produce a valid code from the secret onboardBegin
// just issued. On success the backend marks them registered AND logs them in
// (sets the real session cookie) — no separate login call needed right after.
export function onboardComplete(kitId: string, code: string): Promise<SessionResponse> {
  return apiFetch<SessionResponse>('/api/onboard/complete', {
    method: 'POST',
    body: { kitId, code },
  });
}

// Real member login — one combined submit (KIT ID + code together), matching
// the backend's deliberate anti-enumeration design: every failure reason
// (unknown KIT ID, not registered, wrong code) returns the identical generic
// error, so a login attempt can't be used to probe which KIT IDs exist.
export function memberLogin(kitId: string, code: string): Promise<SessionResponse> {
  return apiFetch<SessionResponse>('/api/auth/login', {
    method: 'POST',
    body: { kitId, code },
  });
}

// "Lost my device" recovery: consumes one recovery key and has the server
// issue a brand-new TOTP secret immediately, returning a fresh otpauthUrl to
// scan (same shape as onboardBegin). Does NOT reset registration status —
// confirm the new secret with onboardComplete, not a redirect to registration.
export function memberRecovery(kitId: string, recoveryKey: string): Promise<OnboardBeginResponse> {
  return apiFetch<OnboardBeginResponse>('/api/auth/recovery', {
    method: 'POST',
    body: { kitId, recoveryKey },
  });
}

export function memberLogout(): Promise<void> {
  return apiFetch<void>('/api/auth/logout', { method: 'POST' });
}

export function getMemberSession(): Promise<SessionResponse> {
  return apiFetch<SessionResponse>('/api/session/me');
}

export interface RecordSummary {
  id: number;
  rowIndex: number;
  sourceBatch: string;
  createdAt: string;
}

export interface RecordUpload {
  batchId: string;
  createdAt: string;
  records: RecordSummary[];
}

// Each CSV upload is one batch, and row numbers restart in each batch. The
// backend sorts by batch UUID, which is random, so put uploads back in date
// order here, oldest first, with each upload's rows in their CSV order.
export function groupRecordsByUpload(records: RecordSummary[]): RecordUpload[] {
  const sorted = [...records].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.rowIndex - b.rowIndex
  );
  const uploads = new Map<string, RecordUpload>();
  for (const record of sorted) {
    const upload = uploads.get(record.sourceBatch);
    if (upload) upload.records.push(record);
    else uploads.set(record.sourceBatch, { batchId: record.sourceBatch, createdAt: record.createdAt, records: [record] });
  }
  return Array.from(uploads.values());
}

// Returns the signed-in member's own records only — scoped server-side to
// whoever the session cookie belongs to, not something we filter client-side.
export function getRecords(): Promise<{ records: RecordSummary[] }> {
  return apiFetch<{ records: RecordSummary[] }>('/api/records');
}

export interface RecordField {
  column: string;
  value: string;
}

export interface RecordDetail extends RecordSummary {
  fields: RecordField[];
}

// There's no fixed record schema on the backend — fields is just whatever
// columns existed in the CSV row an admin ingested, as column/value pairs.
export function getRecord(id: number): Promise<RecordDetail> {
  return apiFetch<RecordDetail>(`/api/records/${id}`);
}
