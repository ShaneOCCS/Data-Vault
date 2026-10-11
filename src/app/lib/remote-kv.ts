'use client';

/**
 * Reads/writes a JSON value on the Next.js server (see /api/kv) so data is
 * shared between devices instead of living in one browser's localStorage.
 */

export async function remoteRead<T>(key: string, fallback: T): Promise<T> {
  if (typeof window === 'undefined') return fallback;
  try {
    const res = await fetch(`/api/kv?key=${encodeURIComponent(key)}`, { cache: 'no-store' });
    if (!res.ok) return fallback;
    const data = await res.json();
    return data ?? fallback;
  } catch {
    return fallback;
  }
}

export async function remoteWrite(key: string, value: unknown): Promise<void> {
  if (typeof window === 'undefined') return;
  const res = await fetch(`/api/kv?key=${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
  if (!res.ok) throw new Error('Could not save to server');
}
