'use client';

import { LoginFlow } from '@/components/auth/LoginFlow';
import { CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { AuthShell, type AuthPanel } from '@/components/site/SiteShell';

function LoginContent() {
  const searchParams = useSearchParams();
  const isLoggedOut = searchParams.get('logout') === 'success';
  const recoverMode = searchParams.get('recover') === '1';

  const panel: AuthPanel = recoverMode
    ? {
        title: 'Lost your phone?',
        intro: 'You can still get in with a recovery key.',
        points: [
          { title: 'Find your recovery keys', body: 'They came with your KIT ID and setup code. Check wherever you saved them.' },
          { title: 'Enter your KIT ID and one key', body: 'Each key works once, so cross it off after.' },
          { title: 'Connect your new phone', body: 'Scan a new QR code with your authenticator app.' },
        ],
        help: <>Lost your recovery keys too? Contact the clinic that gave you your kit.</>,
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
            Lost your phone?{' '}
            <Link href="/login?recover=1" className="font-semibold text-white underline underline-offset-2">
              Recover access
            </Link>
          </>
        ),
      };

  return (
    <AuthShell panel={panel}>
      {isLoggedOut && (
        <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle2 className="h-4 w-4" />
          <span>You&apos;ve been signed out.</span>
        </div>
      )}
      <LoginFlow />
    </AuthShell>
  );
}

export default function LoginPage() {
  return <Suspense fallback={<div className="min-h-screen bg-background" />}><LoginContent /></Suspense>;
}
