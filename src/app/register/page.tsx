'use client';

import { RegistrationFlow } from '@/components/auth/RegistrationFlow';
import { Suspense } from 'react';
import { AuthShell, type AuthPanel } from '@/components/site/SiteShell';

const panel: AuthPanel = {
  title: 'Set up in about 2 minutes',
  intro: 'Have these ready before you start:',
  points: [
    { title: 'Your kit card', body: 'It has your KIT ID and a one-time setup code.' },
    { title: 'Your phone', body: 'With Google Authenticator or Microsoft Authenticator installed. Both are free.' },
    { title: 'Your recovery keys', body: 'They came with your kit. Keep them safe in case you lose your phone.' },
  ],
  help: <>No email, name or password needed. Your KIT ID is all that identifies you.</>,
};

export default function RegisterPage() {
  return (
    <AuthShell panel={panel}>
      <Suspense fallback={null}>
        <RegistrationFlow />
      </Suspense>
    </AuthShell>
  );
}
