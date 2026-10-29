'use client';

import { RegistrationFlow } from '@/components/auth/RegistrationFlow';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { AuthShell, type AuthPanel } from '@/components/site/SiteShell';

function RegisterContent() {
  const searchParams = useSearchParams();
  const isRelink = searchParams.get('relink') === 'true';

  const panel: AuthPanel = isRelink
    ? {
        title: 'Connect your new phone',
        intro: 'Your recovery key worked. Two quick steps left:',
        points: [
          { title: 'Scan the new QR code', body: 'Use Google Authenticator or Microsoft Authenticator on your new phone.' },
          { title: 'Save your new recovery keys', body: 'You get a fresh set. The old ones stop working.' },
        ],
        help: <>Your records are safe. Only the way you sign in is changing.</>,
      }
    : {
        title: 'Set up in about 2 minutes',
        intro: 'Have these ready before you start:',
        points: [
          { title: 'Your kit card', body: 'It has your KIT ID and a one-time setup code.' },
          { title: 'Your phone', body: 'With Google Authenticator or Microsoft Authenticator installed. Both are free.' },
          { title: 'Somewhere to save keys', body: 'At the end you get recovery keys. Download them or write them down.' },
        ],
        help: <>No email, name or password needed. Your KIT ID is all that identifies you.</>,
      };

  return (
    <AuthShell panel={panel}>
      <RegistrationFlow />
    </AuthShell>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <RegisterContent />
    </Suspense>
  );
}
