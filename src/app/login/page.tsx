'use client';

import { LoginFlow } from '@/components/auth/LoginFlow';
import { CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { AuthShell, type AuthPanel } from '@/components/site/SiteShell';
import { useT } from '@/lib/i18n';

function LoginContent() {
  const searchParams = useSearchParams();
  const isLoggedOut = searchParams.get('logout') === 'success';
  const recoverMode = searchParams.get('recover') === '1';
  const { t } = useT();

  const panel: AuthPanel = recoverMode
    ? {
        title: 'Lost your phone?',
        intro: 'You can still get in with a recovery key, one of the backup codes printed on your kit card.',
        points: [
          { title: 'Find your kit card', body: 'Your recovery keys are printed on it, below your KIT ID and setup code.' },
          { title: 'Enter your KIT ID and one recovery key', body: 'Each key works only once. Cross it off after you use it.' },
          { title: 'Connect your new phone', body: 'Scan a new QR code with your authenticator app.' },
        ],
        help: <>{t('No recovery keys left, or lost your card? Contact the clinic that gave you your kit.')}</>,
      }
    : {
        title: 'Welcome back',
        intro: 'Signing in takes two things:',
        points: [
          { title: 'Your KIT ID', body: 'The 7-character ID printed on the card that came with your kit.' },
          { title: 'Your phone', body: 'Open your authenticator app for the 6-digit code. It changes every 30 seconds.' },
        ],
        help: (
          <>
            {t('Lost your phone?')}{' '}
            <Link href="/login?recover=1" className="font-semibold text-primary underline underline-offset-2">
              {t('Recover access')}
            </Link>
          </>
        ),
      };

  return (
    <AuthShell panel={panel}>
      {isLoggedOut && (
        <div className="flex items-center gap-3 rounded-xl border border-status-good-line bg-status-good-soft px-4 py-3 text-sm text-status-good-ink">
          <CheckCircle2 className="h-4 w-4" />
          <span>{t("You've been signed out.")}</span>
        </div>
      )}
      <LoginFlow />
    </AuthShell>
  );
}

export default function LoginPage() {
  return <Suspense fallback={<div className="min-h-screen bg-background" />}><LoginContent /></Suspense>;
}
