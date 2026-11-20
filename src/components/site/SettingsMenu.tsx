'use client';

// Display & language settings, opened from the gear button in every header.
// Choices are saved in this browser only (see lib/preferences.tsx).

import { Settings2, Languages, Type, SunMoon, Contrast, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { usePrefs, type Lang, type TextSize, type Theme } from '@/lib/preferences';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type Option<V extends string> = { value: V; label: string; lang?: string };

function Segmented<V extends string>({
  label,
  icon,
  value,
  options,
  onChange,
}: {
  label: string;
  icon: React.ReactNode;
  value: V;
  options: Option<V>[];
  onChange: (v: V) => void;
}) {
  return (
    <div className="space-y-2">
      <p id={`set-${label}`} className="flex items-center gap-2 text-sm font-semibold">
        {icon} {label}
      </p>
      <div role="radiogroup" aria-labelledby={`set-${label}`} className="grid grid-flow-col auto-cols-fr gap-1 rounded-lg border bg-muted p-1">
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              lang={o.lang}
              onClick={() => onChange(o.value)}
              className={cn(
                'rounded-md px-2 py-1.5 text-sm font-medium transition-colors',
                on ? 'bg-card text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Toggle({
  label,
  hint,
  icon,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  icon: React.ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-start justify-between gap-4 rounded-lg border p-3 text-left hover:border-primary transition-colors"
    >
      <span className="flex gap-2">
        <span className="mt-0.5">{icon}</span>
        <span>
          <span className="block text-sm font-semibold">{label}</span>
          <span className="block text-xs text-muted-foreground mt-0.5">{hint}</span>
        </span>
      </span>
      <span
        aria-hidden
        className={cn(
          'relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors',
          checked ? 'bg-primary' : 'bg-input',
        )}
      >
        <span
          className={cn(
            'inline-block h-5 w-5 rounded-full bg-background shadow transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0',
          )}
        />
      </span>
    </button>
  );
}

/** Round settings button fixed to the bottom-left corner of every page (rendered once in layout.tsx). */
export function SettingsMenu() {
  const { prefs, setPrefs, reset } = usePrefs();
  const { t } = useT();

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={t('Display and language settings')}
          title={t('Settings')}
          className="fixed bottom-4 left-4 z-40 inline-flex h-12 w-12 items-center justify-center rounded-full border bg-card text-foreground shadow-lg transition-colors hover:border-primary hover:text-primary print:hidden"
        >
          <Settings2 className="h-5 w-5" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('Display and language')}</DialogTitle>
          <DialogDescription>{t('Saved on this device only.')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1">
          <Segmented<Lang>
            label={t('Language')}
            icon={<Languages className="h-4 w-4" />}
            value={prefs.lang}
            onChange={(lang) => setPrefs({ lang })}
            options={[
              { value: 'en', label: 'English', lang: 'en' },
              { value: 'fr', label: 'Français', lang: 'fr' },
            ]}
          />

          <Segmented<TextSize>
            label={t('Text size')}
            icon={<Type className="h-4 w-4" />}
            value={prefs.textSize}
            onChange={(textSize) => setPrefs({ textSize })}
            options={[
              { value: 'normal', label: t('Normal') },
              { value: 'large', label: t('Large') },
              { value: 'xl', label: t('Extra large') },
            ]}
          />

          <Segmented<Theme>
            label={t('Theme')}
            icon={<SunMoon className="h-4 w-4" />}
            value={prefs.theme}
            onChange={(theme) => setPrefs({ theme })}
            options={[
              { value: 'light', label: t('Light') },
              { value: 'dark', label: t('Dark') },
              { value: 'system', label: t('Device') },
            ]}
          />

          <div className="space-y-2">
            <Toggle
              label={t('High contrast')}
              hint={t('Darker text and stronger outlines.')}
              icon={<Contrast className="h-4 w-4" />}
              checked={prefs.highContrast}
              onChange={(highContrast) => setPrefs({ highContrast })}
            />
          </div>

          <Button variant="ghost" size="sm" onClick={reset} className="gap-2 text-muted-foreground">
            <RotateCcw className="h-4 w-4" /> {t('Reset to default')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
