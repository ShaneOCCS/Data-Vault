'use client';

import { RegistrationFlow } from '@/components/auth/RegistrationFlow';
import { Suspense } from 'react';
import { AuthShell, type AuthPanel } from '@/components/site/SiteShell';
import { useT } from '@/lib/i18n';

const panel: AuthPanel = {
  title: 'Set up in about 2 minutes',
  intro: 'Have these ready before you start:',
  points: [
    { title: 'Your kit card', body: 'It has your KIT ID and a one-time setup code.' },
    { title: 'Your phone', body: 'With Google Authenticator or Microsoft Authenticator installed. Both are free.' },
    { title: 'Your recovery keys', body: 'Backup codes printed on your kit card. You’ll need one if you ever lose your phone, so keep the card somewhere safe.' },
  ],
};

function Help() {
  const { t } = useT();
  return <>{t('No email, name or password needed. Your KIT ID is all that identifies you.')}</>;
}

export default function RegisterPage() {
  return (
    <AuthShell panel={{ ...panel, help: <Help /> }}>
      <Suspense fallback={null}>
        <RegistrationFlow />
      </Suspense>
    </AuthShell>
  );
}
