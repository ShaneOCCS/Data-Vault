'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ChevronRight, LifeBuoy } from 'lucide-react';
import { SiteHeader, SiteFooter } from '@/components/site/SiteShell';
import { useT } from '@/lib/i18n';

const steps = [
  {
    title: 'Find your KIT ID and setup code',
    body: 'Both are printed on the card that came with your kit. You only use the setup code once.',
  },
  {
    title: 'Connect an authenticator app',
    body: 'Scan the QR code with Google Authenticator or Microsoft Authenticator. It gives you a new 6-digit code every 30 seconds.',
  },
  {
    title: 'Sign in and view your records',
    body: 'Each time you come back, enter your KIT ID and the code from the app. No email or password.',
  },
];

export default function Home() {
  const { t } = useT();
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SiteHeader
        right={
          <Button asChild size="sm">
            <Link href="/login">{t('Sign in')}</Link>
          </Button>
        }
      />

      <main id="main" className="flex-1 flex flex-col bg-panel bg-[radial-gradient(ellipse_at_top_right,hsl(var(--primary)/0.12),transparent_55%)]">
        <section className="flex-1 w-full mx-auto px-6 py-16 md:py-24 grid gap-12 md:grid-cols-2 md:items-center content-center max-w-7xl">
          <div className="space-y-6">
            <h1 className="text-4xl md:text-5xl font-headline font-bold text-foreground tracking-tight leading-tight">
              {t('Your health records, in one private place')}
            </h1>
            <p className="text-lg text-muted-foreground max-w-md">
              {t('Sign in with your KIT ID and a code from your phone to see the results linked to your kit.')}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button size="lg" asChild className="font-semibold">
                <Link href="/login">
                  {t('Sign in')} <ChevronRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="font-semibold">
                <Link href="/register">{t('First time? Set up your account')}</Link>
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border bg-card p-6 md:p-8 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-6">
              {t('How it works')}
            </h2>
            <ol className="space-y-6">
              {steps.map((step, i) => (
                <li key={step.title} className="flex gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-semibold text-foreground">{t(step.title)}</p>
                    <p className="text-sm text-muted-foreground mt-1">{t(step.body)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="border-t bg-card">
          <div className="container mx-auto px-6 py-8 max-w-7xl flex gap-4 items-start">
            <LifeBuoy className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-foreground">{t('Lost your phone or got a new one?')}</p>
              <p className="text-muted-foreground mt-1">
                {t('Use a recovery key to get back in. Recovery keys are the backup codes printed on your kit card, and each one works only once.')}
              </p>
              <Link href="/login?recover=1" className="inline-flex items-center gap-1 mt-2 font-semibold text-primary hover:underline">
                {t('Recover access')} <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
