'use client';

// Simple translation layer (English + French).
//
// The English text IS the key: t('Sign in') returns 'Sign in' in English and
// FR['Sign in'] in French. Anything missing from the French list falls back
// to English, so a forgotten string never breaks the page.
// Placeholders: t('Page {n} of {total}', { n: 2, total: 5 }).
//
// To add a language: copy i18n-fr.ts, translate the values, add it below and
// to the Lang type in preferences.tsx.

import { useCallback } from 'react';
import { usePrefs, type Lang } from './preferences';
import { FR } from './i18n-fr';

export type Vars = Record<string, string | number>;
export type TFunc = (text: string, vars?: Vars) => string;

const DICTS: Record<Lang, Record<string, string>> = { en: {}, fr: FR };

export function translate(lang: Lang, text: string, vars?: Vars): string {
  let out = DICTS[lang][text] ?? text;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
  }
  return out;
}

export function localeFor(lang: Lang): string {
  return lang === 'fr' ? 'fr-CA' : 'en-CA';
}

export function useT() {
  const { prefs } = usePrefs();
  const lang = prefs.lang;
  const t = useCallback<TFunc>((text, vars) => translate(lang, text, vars), [lang]);
  return { t, lang, locale: localeFor(lang) };
}
