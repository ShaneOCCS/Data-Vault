'use client';

const KEY = 'data_vault_admin_display';

export interface AdminDisplay {
  email: string;
  name: string;
}

// Holds {email, name} for display only. The real session is the httpOnly
// cookie, which the dashboard checks with the server on load. This lives in
// localStorage, not sessionStorage, because the cookie is shared across tabs:
// a logged-in admin opening a new tab must still know who they are.

// Called right after a successful login/invite-accept, with the response body
export function setAdminDisplayCache(admin: AdminDisplay) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY, JSON.stringify(admin));
}

// Read by dashboard/header UI to show "Signed in as ..." without another API call
export function getAdminDisplayCache(): AdminDisplay | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Called on logout and when the server reports the session has ended
export function clearAdminDisplayCache() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(KEY);
}
