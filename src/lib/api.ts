'use client';

// Central client for the real Medical Vault Go backend. Every real backend
// call goes through apiFetch() so credentials/headers/error handling are
// set once, in one place, instead of repeated (or forgotten) per call site.
//
// Base URL comes from NEXT_PUBLIC_API_BASE_URL (see .env.local) so pointing
// at a real domain later, instead of the local SSH tunnel, is a config
// change, not a code change.

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:18080';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

interface ApiFetchOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { method = 'GET', body } = options;
  const isFormData = body instanceof FormData; // CSV upload sends FormData, everything else sends JSON

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    credentials: 'include', // required so the admin session cookie is sent/stored
    // Only requests with a JSON body declare one. On a GET this header would trigger a needless CORS preflight.
    headers: body !== undefined && !isFormData ? { 'Content-Type': 'application/json' } : undefined,
    body: isFormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    data = null; // some error responses (or 204s) have no JSON body
  }

  if (!res.ok) {
    // Backend error shape is {"error": "message"} — fall back to a generic message if that's not what we got
    const message =
      data && typeof data === 'object' && data !== null && 'error' in data && typeof (data as { error: unknown }).error === 'string'
        ? (data as { error: string }).error
        : `Request failed (${res.status})`;
    throw new ApiError(res.status, message);
  }

  return data as T;
}

// True for the 429 the backend's rate limiter returns.
export function isRateLimited(e: unknown): boolean {
  return e instanceof ApiError && e.status === 429;
}

export const RATE_LIMIT_MESSAGE = 'Too many attempts — please wait a moment and try again.';
