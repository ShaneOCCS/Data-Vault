import Link from 'next/link';
import { Shield, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

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
        <Shield className="h-5 w-5 text-white" />
      </div>
      <span className="font-headline font-bold text-lg text-primary">{label}</span>
    </Link>
  );
}

export function SiteHeader({
  right,
  logoLabel,
  logoHref,
}: {
  right?: React.ReactNode;
  logoLabel?: string;
  logoHref?: string;
}) {
  return (
    <header className="border-b bg-white">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <Logo label={logoLabel} href={logoHref} />
        {right && <div className="flex items-center gap-3">{right}</div>}
      </div>
    </header>
  );
}

export function SiteFooter({ showStaffLink = true }: { showStaffLink?: boolean }) {
  return (
    <footer className="border-t bg-white">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 flex flex-col sm:flex-row justify-between items-center gap-3 text-sm text-muted-foreground">
        <p>© {new Date().getFullYear()} Data Vault</p>
        {showStaffLink && (
          <Link href="/admin/login" className="hover:text-primary transition-colors">
            Staff sign in
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
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SiteHeader right={headerRight} logoLabel={logoLabel} />
      <main className="flex-1 flex items-start lg:items-center justify-center px-4 sm:px-6 py-10 lg:py-16">
        <div
          className={cn(
            'w-full',
            panel ? 'max-w-5xl grid gap-10 lg:grid-cols-2 lg:gap-0 lg:rounded-3xl lg:border lg:bg-white lg:shadow-sm lg:overflow-hidden' : 'max-w-md'
          )}
        >
          {panel && (
            <aside className="hidden lg:flex flex-col justify-between bg-primary text-primary-foreground p-10">
              <div className="space-y-8">
                <div className="space-y-3">
                  <h2 className="text-2xl font-semibold tracking-tight">{panel.title}</h2>
                  {panel.intro && <p className="text-sm text-primary-foreground/80">{panel.intro}</p>}
                </div>
                <ul className="space-y-5">
                  {panel.points.map((pt, i) => (
                    <li key={pt.title} className="flex gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/15 text-xs font-semibold">
                        {i + 1}
                      </span>
                      <div>
                        <p className="text-sm font-semibold">{pt.title}</p>
                        <p className="text-sm text-primary-foreground/75 mt-0.5">{pt.body}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              {panel.help && (
                <div className="mt-10 rounded-xl bg-white/10 p-4 text-sm text-primary-foreground/90">{panel.help}</div>
              )}
            </aside>
          )}
          <div className={cn('w-full space-y-4', panel && 'mx-auto max-w-md lg:max-w-none lg:p-10 lg:flex lg:flex-col lg:justify-center [&>div:first-child]:lg:border-0 [&>div:first-child]:lg:shadow-none')}>
            {children}
          </div>
        </div>
      </main>
      <SiteFooter showStaffLink={showStaffLink} />
    </div>
  );
}

/** The one card style used for every sign-in / setup step. */
export function AuthCard({
  step,
  title,
  description,
  onBack,
  backLabel = 'Back',
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
  return (
    <div className={cn('rounded-2xl border bg-white shadow-sm', className)}>
      <div className="p-6 sm:p-8 space-y-6">
        <div className="space-y-2">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors mb-2"
            >
              <ArrowLeft className="h-4 w-4" /> {backLabel}
            </button>
          )}
          {step && <p className="text-xs font-semibold uppercase tracking-wide text-primary">{step}</p>}
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
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
