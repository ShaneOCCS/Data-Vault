'use client';

// Display & language preferences (accessibility settings).
//
// Stored per browser in localStorage under `dv_prefs`. Applied to <html> as:
//   lang="en|fr"              language
//   class="dark"              dark mode (Tailwind darkMode: 'class')
//   data-text-size="..."      normal | large | xl  (scales every rem-based size)
//   data-contrast="high"      high contrast
// PREFS_BOOT_SCRIPT applies the same attributes before React loads so the
// page never flashes the wrong theme or size.

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type Lang = 'en' | 'fr';
export type TextSize = 'normal' | 'large' | 'xl';
export type Theme = 'light' | 'dark' | 'system';

export type Prefs = {
  lang: Lang;
  textSize: TextSize;
  theme: Theme;
  highContrast: boolean;
};

export const DEFAULT_PREFS: Prefs = {
  lang: 'en',
  textSize: 'normal',
  theme: 'light',
  highContrast: false,
};

const STORAGE_KEY = 'dv_prefs';

function readStored(): Prefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const p = JSON.parse(raw) as Partial<Prefs>;
    return {
      lang: p.lang === 'fr' ? 'fr' : 'en',
      textSize: p.textSize === 'large' || p.textSize === 'xl' ? p.textSize : 'normal',
      theme: p.theme === 'dark' || p.theme === 'system' ? p.theme : 'light',
      highContrast: !!p.highContrast,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function isDark(theme: Theme): boolean {
  if (theme === 'dark') return true;
  if (theme === 'system') {
    try {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
      return false;
    }
  }
  return false;
}

function apply(p: Prefs) {
  const el = document.documentElement;
  el.lang = p.lang === 'fr' ? 'fr-CA' : 'en-CA';
  el.classList.toggle('dark', isDark(p.theme));
  el.dataset.textSize = p.textSize;
  if (p.highContrast) el.dataset.contrast = 'high';
  else delete el.dataset.contrast;
}

// Inline in <head> (see layout.tsx). Plain JS, no imports: runs before paint.
export const PREFS_BOOT_SCRIPT = `(function(){try{var p=JSON.parse(localStorage.getItem('${STORAGE_KEY}')||'{}');var e=document.documentElement;e.lang=p.lang==='fr'?'fr-CA':'en-CA';var d=p.theme==='dark'||(p.theme==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)e.classList.add('dark');e.dataset.textSize=(p.textSize==='large'||p.textSize==='xl')?p.textSize:'normal';if(p.highContrast)e.dataset.contrast='high';}catch(_){}})();`;

type Ctx = {
  prefs: Prefs;
  setPrefs: (patch: Partial<Prefs>) => void;
  reset: () => void;
  /** true once the stored prefs have been read (avoids a flash of English text) */
  ready: boolean;
};

const PrefsContext = createContext<Ctx>({
  prefs: DEFAULT_PREFS,
  setPrefs: () => {},
  reset: () => {},
  ready: false,
});

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setState] = useState<Prefs>(DEFAULT_PREFS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = readStored();
    setState(stored);
    apply(stored);
    setReady(true);
  }, []);

  // Follow the OS theme live when "system" is chosen.
  useEffect(() => {
    if (prefs.theme !== 'system') return;
    let mq: MediaQueryList;
    try {
      mq = window.matchMedia('(prefers-color-scheme: dark)');
    } catch {
      return;
    }
    const onChange = () => apply(prefs);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [prefs]);

  const setPrefs = useCallback((patch: Partial<Prefs>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      apply(next);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* private mode etc. — settings just won't be remembered */
      }
      return next;
    });
  }, []);

  const reset = useCallback(() => setPrefs(DEFAULT_PREFS), [setPrefs]);

  return <PrefsContext.Provider value={{ prefs, setPrefs, reset, ready }}>{children}</PrefsContext.Provider>;
}

export function usePrefs() {
  return useContext(PrefsContext);
}

/** Whether dark mode is actually showing (resolves "system"). */
export function useIsDark(): boolean {
  const { prefs } = usePrefs();
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(isDark(prefs.theme));
  }, [prefs.theme]);
  return dark;
}
