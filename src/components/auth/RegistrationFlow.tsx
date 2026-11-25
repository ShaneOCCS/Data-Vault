'use client';

// CHANGED: full rewrite to call the real backend instead of the client-side
// mock. Old flow: generate a TOTP secret in the browser, show it, accept a
// bare "I've scanned it" click with no code verification, then generate and
// display 3 brand-new recovery keys here. New flow: the server generates the
// secret (never the browser), a code from an authenticator app must actually
// be verified before anything is marked registered, and no recovery keys are
// generated here at all — they were already minted by an admin at
// provisioning time and are not part of this screen anymore.
//
// Two steps only now:
//   1. KIT ID + Registration Code (the one-time signup key an admin gave this
//      member) -> POST /api/onboard/begin -> server returns an otpauthUrl.
//   2. Scan the QR drawn from that otpauthUrl, enter the 6-digit code from
//      the authenticator app -> POST /api/onboard/complete -> on success the
//      backend marks them registered AND logs them in (sets the real session
//      cookie), so we go straight to /dashboard. No "step 3" needed.

import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ArrowRight, Copy, Check, AlertCircle, Loader2 } from 'lucide-react';
import { AuthCard, AuthNote } from '@/components/site/SiteShell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useSearchParams, useRouter } from 'next/navigation';
import { isRateLimited, RATE_LIMIT_MESSAGE } from '@/lib/api';
import Link from 'next/link';
import { useT } from '@/lib/i18n';
import QRCode from 'qrcode'; // NEW: renders the QR entirely in the browser from the server's otpauthUrl — the secret never gets sent to a third-party service like the old api.qrserver.com call did
import { onboardBegin, onboardComplete } from '@/lib/member-api'; // NEW: real backend calls

export function RegistrationFlow() {
  const router = useRouter();
  const { t } = useT();
  const searchParams = useSearchParams();

  const [step, setStep] = useState(1);
  const [kitId, setKitId] = useState(searchParams.get('kitId') || ''); // convenience prefill from a link like /register?kitId=ABC1234
  const [signupKey, setSignupKey] = useState(''); // RENAMED from regCode — this is the backend's one-time signup key, same field, clearer name
  const [code, setCode] = useState(''); // NEW: the 6-digit authenticator code, entered in step 2
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // NEW: populated from the server's response in step 1, not generated client-side
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [manualSecret, setManualSecret] = useState(''); // parsed out of otpauthUrl, for the "can't scan" manual-entry fallback

  // REMOVED: the old useEffect that called generateSecret() on mount and the
  // relink/?relink=true branch — recovery no longer routes back through this
  // component (see member-api.ts's memberRecovery: it returns its own
  // otpauthUrl directly, it doesn't reset registration and bounce here).

  const handleBegin = async () => {
    if (!kitId || !signupKey) return;
    setLoading(true);
    setError('');

    try {
      const { otpauthUrl: url } = await onboardBegin(kitId, signupKey);

      // Pull the secret back out of the otpauth:// URL just for the
      // manual-entry display — it's the same value the QR encodes, so this
      // isn't a new exposure, just a convenience for people who can't scan.
      try {
        const parsed = new URL(url);
        setManualSecret(parsed.searchParams.get('secret') || '');
      } catch {
        setManualSecret('');
      }

      const dataUrl = await QRCode.toDataURL(url, { width: 240, margin: 1 });
      setQrDataUrl(dataUrl);

      setStep(2);
    } catch (e) {
      // Generic message on purpose — matches the backend's own design, where
      // every onboard/begin failure (unknown KIT ID, bad/used/wrong-purpose
      // key) returns the same 401, so this screen shouldn't invent a more
      // specific one.
      setError(isRateLimited(e) ? RATE_LIMIT_MESSAGE : 'Please double-check your KIT ID and registration code.');
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async () => {
    if (!kitId || !code) return;
    setLoading(true);
    setError('');

    try {
      await onboardComplete(kitId, code);
      // Backend already set the session cookie — straight to the dashboard,
      // no detour through /login.
      router.push('/dashboard');
    } catch (e) {
      setError(isRateLimited(e) ? RATE_LIMIT_MESSAGE : 'Please check your authenticator app and re-enter the 6-digit code.');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const errorAlert = error ? (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertDescription>{t(error)}</AlertDescription>
    </Alert>
  ) : null;

  if (step === 1) {
    return (
      <>
        <AuthCard
          step="Step 1 of 2"
          title="Set up your account"
          description="Enter the KIT ID and setup code from the card that came with your kit."
          footer={
            <Button onClick={handleBegin} disabled={loading || !kitId || !signupKey} className="w-full h-11 font-semibold">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>{t('Continue')} <ArrowRight className="ml-2 h-4 w-4" /></>}
            </Button>
          }
        >
          <div className="space-y-2">
            <Label htmlFor="kitId">{t('KIT ID')}</Label>
            <Input
              id="kitId"
              placeholder={t('e.g. {example}', { example: 'QS9KAH6' })}
              className="h-11 font-mono tracking-wider"
              value={kitId}
              onChange={(e) => setKitId(e.target.value.toUpperCase())}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="signupKey">{t('Setup code')}</Label>
            <Input
              id="signupKey"
              placeholder="xxxxx-xxxxx-xxxxx-xxxxx"
              className="h-11 font-mono"
              value={signupKey}
              onChange={(e) => setSignupKey(e.target.value)} // NOT uppercased — the backend's key is mixed-case and compared exactly
              onKeyDown={(e) => e.key === 'Enter' && handleBegin()}
            />
          </div>
          {errorAlert}
        </AuthCard>
        <AuthNote>
          {t('Already set up?')} <Link href="/login" className="font-medium text-primary hover:underline">{t('Sign in')}</Link>
        </AuthNote>
      </>
    );
  }

  return (
    <AuthCard
      step="Step 2 of 2"
      title="Connect your authenticator app"
      description="Open Google Authenticator or Microsoft Authenticator, tap +, scan this code, then enter the 6-digit code it shows."
      onBack={() => { setError(''); setCode(''); setStep(1); }}
      backLabel="Back"
      footer={
        <Button onClick={handleComplete} disabled={loading || code.length !== 6} className="w-full h-11 font-semibold">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t('Finish setup')}
        </Button>
      }
    >
      <div className="flex justify-center">
        <div className="rounded-xl border p-3">
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrDataUrl} alt={t('QR code for your authenticator app')} className="h-44 w-44" />
          ) : (
            <div className="flex h-44 w-44 items-center justify-center text-xs text-muted-foreground">{t('Generating QR…')}</div>
          )}
        </div>
      </div>
      {manualSecret && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{t("Can't scan? Type this key into the app instead:")}</p>
          <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2">
            <code className="font-mono text-sm font-semibold break-all">{manualSecret}</code>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => copyToClipboard(manualSecret)} aria-label={t('Copy key')}>
              {copied ? <Check className="h-4 w-4 text-status-good-ink" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="code">{t('6-digit code')}</Label>
        <Input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="000000"
          className="h-12 text-center text-xl tracking-[0.5em] font-mono"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && code.length === 6 && handleComplete()}
        />
      </div>
      {errorAlert}
    </AuthCard>
  );
}
