
'use client';

import { LoginFlow } from '@/components/auth/LoginFlow';
import { CheckCircle2 } from 'lucide-react';
import { AuthShell, type AuthPanel } from '@/components/site/SiteShell';
import Link from 'next/link';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { seedDemoAccounts } from '@/app/lib/local-db';

function LoginContent() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const isLoggedOut = searchParams.get('logout') === 'success';
  const recoverMode = searchParams.get('recover') === '1';

  const panel: AuthPanel = recoverMode
    ? {
        title: 'Lost your phone?',
        intro: 'You can still get in with a recovery key.',
        points: [
          { title: 'Find your recovery keys', body: 'They were shown when you set up your account. Check the .txt file or wherever you saved them.' },
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

  const handleReset = async () => {
    try {
      await seedDemoAccounts();
      toast({ variant: 'success', title: "You're All Set", description: 'Please go ahead — the demo KIT IDs are initialized.' });
    } catch (e) {
      toast({ variant: "destructive", title: "Please Try Again", description: "We couldn't write to local storage." });
    }
  };

  const testAccounts = (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground">Test accounts</Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 rounded-xl">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">Test KIT IDs (mock data)</h4>
            <Button variant="ghost" size="sm" onClick={handleReset} className="h-7 text-xs text-primary">Reset data</Button>
          </div>
          <div className="space-y-2 text-xs">
            <div className="rounded-lg bg-muted p-2"><p>KIT ID: <code>K12345</code></p><p>Setup code: <code>ABCD-1234</code></p></div>
            <div className="rounded-lg bg-muted p-2"><p>KIT ID: <code>K98765</code></p><p>Setup code: <code>WXYZ-5678</code></p></div>
          </div>
          <p className="text-xs text-muted-foreground">Remove this before the client demo.</p>
        </div>
      </PopoverContent>
    </Popover>
  );

  return (
    <AuthShell headerRight={testAccounts} panel={panel}>
      {isLoggedOut && (
        <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle2 className="h-4 w-4" />
          <span>You've been signed out.</span>
        </div>
      )}
      <LoginFlow />
    </AuthShell>
  );
}

export default function LoginPage() {
  return <Suspense fallback={<div className="min-h-screen bg-background" />}><LoginContent /></Suspense>;
}
