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
  fullWidth = false,
}: {
  right?: React.ReactNode;
  logoLabel?: string;
  logoHref?: string;
  fullWidth?: boolean; // for pages with a sidebar: logo lines up with the sidebar
}) {
  return (
    <header className="border-b bg-white">
      <div className={cn('mx-auto w-full px-4 sm:px-6 h-16 flex items-center justify-between gap-4', !fullWidth && 'max-w-6xl')}>
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
  if (!panel) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <SiteHeader right={headerRight} logoLabel={logoLabel} />
        <main className="flex-1 flex items-start sm:items-center justify-center px-4 sm:px-6 py-10 sm:py-16">
          <div className="w-full max-w-md space-y-4">{children}</div>
        </main>
        <SiteFooter showStaffLink={showStaffLink} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:bg-white">
      {/* Laptops: full-height blue side with the logo and page-specific help */}
      <aside className="hidden lg:flex flex-col justify-between bg-primary text-primary-foreground px-12 py-10">
        <Link href="/" className="flex items-center gap-2">
          <div className="rounded-lg bg-white/15 p-1.5">
            <Shield className="h-5 w-5 text-white" />
          </div>
          <span className="font-headline text-lg font-bold">{logoLabel ?? 'Data Vault'}</span>
        </Link>
        <div className="max-w-md space-y-8">
          <div className="space-y-3">
            <h2 className="text-3xl font-semibold tracking-tight">{panel.title}</h2>
            {panel.intro && <p className="text-primary-foreground/80">{panel.intro}</p>}
          </div>
          <ul className="space-y-5">
            {panel.points.map((pt, i) => (
              <li key={pt.title} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/15 text-xs font-semibold">
                  {i + 1}
                </span>
                <div>
                  <p className="font-semibold">{pt.title}</p>
                  <p className="text-sm text-primary-foreground/75 mt-0.5">{pt.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        {panel.help ? (
          <div className="max-w-md rounded-xl bg-white/10 p-4 text-sm text-primary-foreground/90">{panel.help}</div>
        ) : (
          <span />
        )}
      </aside>

      {/* Phones get the normal header; laptops get a slim top row instead */}
      <div className="lg:hidden">
        <SiteHeader right={headerRight} logoLabel={logoLabel} />
      </div>
      <div className="flex min-h-screen flex-col lg:min-h-0">
        <div className="hidden lg:flex h-16 items-center justify-end gap-3 px-10">{headerRight}</div>
        <main className="flex-1 flex items-start lg:items-center justify-center px-4 sm:px-6 py-10">
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
              Staff sign in
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
