'use client';

import Link from 'next/link';
import { Shield, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';

/**
 * Shared page chrome so every page uses the same header, footer, widths and
 * type sizes as the landing page.
 *
 * Type scale used across the app:
 *   page title     text-2xl font-semibold   (landing hero is the only bigger one)
 *   section title  text-base font-semibold
 *   body           text-sm text-muted-foreground
 *   labels/meta    text-xs
 */

export function Logo({ label = 'Data Vault', href = '/' }: { label?: string; href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2">
      <div className="bg-primary rounded-lg p-1.5">
        <Shield className="h-5 w-5 text-primary-foreground" />
      </div>
      <span className="font-headline font-bold text-lg text-primary">{label}</span>
    </Link>
  );
}

export function SiteHeader({
  right,
  logoLabel,
  logoHref,
  fullWidth = false,
}: {
  right?: React.ReactNode;
  logoLabel?: string;
  logoHref?: string;
  fullWidth?: boolean; // for pages with a sidebar: logo lines up with the sidebar
}) {
  return (
    <header className="border-b bg-card">
      <SkipLink />
      <div className={cn('mx-auto w-full px-4 sm:px-6 h-16 flex items-center justify-between gap-4', !fullWidth && 'max-w-6xl')}>
        <Logo label={logoLabel} href={logoHref} />
        {right && <div className="flex items-center gap-3">{right}</div>}
      </div>
    </header>
  );
}

export function SiteFooter({ showStaffLink = true }: { showStaffLink?: boolean }) {
  const { t } = useT();
  return (
    <footer className="border-t bg-card">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 flex flex-col sm:flex-row justify-between items-center gap-3 text-sm text-muted-foreground">
        <p>© {new Date().getFullYear()} Data Vault</p>
        {showStaffLink && (
          <Link href="/admin/login" className="hover:text-primary transition-colors">
            {t('Staff sign in')}
          </Link>
        )}
      </div>
    </footer>
  );
}

export type AuthPanel = {
  title: string;
  intro?: string;
  points: { title: string; body: string }[];
  help?: React.ReactNode;
};

/**
 * Header + two columns + footer, for sign-in and setup pages.
 * Left: a blue panel with what the person needs for THIS page (hidden on phones).
 * Right: the form card.
 */
export function AuthShell({
  children,
  headerRight,
  logoLabel,
  showStaffLink = true,
  panel,
}: {
  children: React.ReactNode;
  headerRight?: React.ReactNode;
  logoLabel?: string;
  showStaffLink?: boolean;
  panel?: AuthPanel;
}) {
  const { t } = useT();
  if (!panel) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <SiteHeader right={headerRight} logoLabel={logoLabel} />
        <main id="main" className="flex-1 flex items-start sm:items-center justify-center px-4 sm:px-6 py-10 sm:py-16">
          <div className="w-full max-w-md space-y-4">{children}</div>
        </main>
        <SiteFooter showStaffLink={showStaffLink} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:bg-card">
      {/* Laptops: full-height light-blue side with the logo and page-specific help */}
      <div className="hidden lg:block absolute"><SkipLink /></div>
      <aside className="hidden lg:flex flex-col justify-between border-r bg-panel text-foreground px-12 pt-10 pb-24">
        <Link href="/" className="flex items-center gap-2">
          <div className="rounded-lg bg-primary p-1.5">
            <Shield className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-headline text-lg font-bold text-primary">{logoLabel ?? 'Data Vault'}</span>
        </Link>
        <div className="max-w-md space-y-8">
          <div className="space-y-3">
            <h2 className="text-3xl font-semibold tracking-tight">{t(panel.title)}</h2>
            {panel.intro && <p className="text-muted-foreground">{t(panel.intro)}</p>}
          </div>
          <ul className="space-y-5">
            {panel.points.map((pt, i) => (
              <li key={pt.title} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                  {i + 1}
                </span>
                <div>
                  <p className="font-semibold">{t(pt.title)}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">{t(pt.body)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        {panel.help ? (
          <div className="max-w-md rounded-xl border bg-card p-4 text-sm">{panel.help}</div>
        ) : (
          <span />
        )}
      </aside>

      {/* Phones get the normal header; laptops get a slim top row instead */}
      <div className="lg:hidden">
        <SiteHeader right={headerRight} logoLabel={logoLabel} />
      </div>
      <div className="flex min-h-screen flex-col lg:min-h-0">
        <div className="hidden lg:flex h-16 items-center justify-end gap-3 px-10">
          {headerRight}
        </div>
        <main id="main" className="flex-1 flex items-start lg:items-center justify-center px-4 sm:px-6 py-10">
          <div className="w-full max-w-md space-y-4 lg:[&>div:first-child]:border-0 lg:[&>div:first-child]:shadow-none lg:[&>div:first-child>div]:px-0">
            {children}
          </div>
        </main>
        <div className="lg:hidden">
          <SiteFooter showStaffLink={showStaffLink} />
        </div>
        <div className="hidden lg:flex justify-between px-10 py-6 text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} Data Vault</p>
          {showStaffLink && (
            <Link href="/admin/login" className="hover:text-primary transition-colors">
              {t('Staff sign in')}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

/** The one card style used for every sign-in / setup step. */
export function AuthCard({
  step,
  title,
  description,
  onBack,
  backLabel,
  children,
  footer,
  className,
}: {
  step?: string;
  title: string;
  description?: React.ReactNode;
  onBack?: () => void;
  backLabel?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  const { t } = useT();
  return (
    <div className={cn('rounded-2xl border bg-card shadow-sm', className)}>
      <div className="p-6 sm:p-8 space-y-6">
        <div className="space-y-2">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors mb-2"
            >
              <ArrowLeft className="h-4 w-4" /> {t(backLabel ?? 'Back')}
            </button>
          )}
          {step && <p className="text-xs font-semibold uppercase tracking-wide text-primary">{t(step)}</p>}
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t(title)}</h1>
          {description && <p className="text-sm text-muted-foreground">{typeof description === 'string' ? t(description) : description}</p>}
        </div>
        {children && <div className="space-y-4">{children}</div>}
        {footer && <div className="space-y-3">{footer}</div>}
      </div>
    </div>
  );
}

/** Small centered link line under a card ("New here? Set up your account"). */
export function AuthNote({ children }: { children: React.ReactNode }) {
  return <p className="text-center text-sm text-muted-foreground">{children}</p>;
}

/** "Skip to main content" — invisible until a keyboard user tabs to it. */
export function SkipLink() {
  const { t } = useT();
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
    >
      {t('Skip to main content')}
    </a>
  );
}
