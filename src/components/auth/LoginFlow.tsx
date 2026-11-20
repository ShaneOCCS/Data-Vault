'use client';

// CHANGED: full rewrite to call the real backend instead of the client-side
// mock, and to fix a real security issue along the way: the old flow validated
// the KIT ID first — looked it up, checked registered/active, showed a distinct
// error for each — BEFORE ever asking for a code. That two-step reveal is an
// enumeration oracle against the real backend, whose /api/auth/login is
// deliberately built so every failure (unknown KIT ID, not registered, wrong
// code) returns the identical generic 401, so a login attempt alone can't be
// used to probe which KIT IDs exist. Collapsing to one combined submit (KIT ID
// + code together) closes that gap — it matches what the backend was already
// built to expect, not a new restriction invented here.
//
// Recovery also changed to match the real backend: the old flow reset the
// account and redirected into registration. The real POST /api/auth/recovery
// does NOT do that — it directly issues a brand-new TOTP secret and returns a
// fresh QR to scan, no redirect. So recovery is now its own two-step mini-flow:
// enter the recovery key -> scan the new QR and enter the resulting code ->
// done, logged in.

import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ArrowRight, Loader2, LifeBuoy, AlertCircle, Copy, Check } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthCard, AuthNote } from '@/components/site/SiteShell';
import Link from 'next/link';
import QRCode from 'qrcode'; // NEW: renders the QR client-side from the server's otpauthUrl, same approach as RegistrationFlow.tsx
import { memberLogin, memberRecovery, onboardComplete } from '@/lib/member-api'; // NEW: real backend calls
import { isRateLimited, RATE_LIMIT_MESSAGE } from '@/lib/api';
import { useT } from '@/lib/i18n';

// LAYOUT (vishva-charts): which screen shows is driven by the URL, so the
// page's side panel can match it: /login = sign in, /login?recover=1 =
// enter a recovery key (also linked from the home page). The QR step after a
// successful recovery is local state, since it only exists mid-flow.
export function LoginFlow() {
  const router = useRouter();
  const { t } = useT();
  const searchParams = useSearchParams();
  const recoverMode = searchParams.get('recover') === '1';
  const [qrStage, setQrStage] = useState(false);
  const step = qrStage ? 'recoveryQr' : recoverMode ? 'recoveryKey' : 'login';
  const setStep = (next: 'login' | 'recoveryKey' | 'recoveryQr') => {
    if (next === 'recoveryQr') return setQrStage(true);
    setQrStage(false);
    router.push(next === 'recoveryKey' ? '/login?recover=1' : '/login');
  };
  const [kitId, setKitId] = useState('');
  const [code, setCode] = useState(''); // used for both the login screen and the post-recovery confirmation screen
  const [recoveryKey, setRecoveryKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showLostAccessDialog, setShowLostAccessDialog] = useState(false);

  // NEW: populated by memberRecovery(), same pattern as RegistrationFlow's QR step
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [manualSecret, setManualSecret] = useState('');
  const [copied, setCopied] = useState(false);

  // REMOVED: handleNext (the old step-1 KIT-ID-only lookup) — there is no
  // separate "does this KIT ID exist" step anymore, by design (see header
  // comment). Login is now a single combined submit below.

  const handleLogin = async () => {
    if (!kitId || code.length !== 6) return;
    setLoading(true);
    setError('');

    try {
      await memberLogin(kitId, code);
      router.push('/dashboard');
    } catch (e) {
      // Deliberately one generic message regardless of why it failed (unknown
      // KIT ID, not registered, wrong code) — matches the backend's own
      // anti-enumeration design, so this screen doesn't leak back what the
      // backend is specifically built to hide.
      setError(isRateLimited(e) ? RATE_LIMIT_MESSAGE : 'Please double-check your KIT ID and code.');
    } finally {
      setLoading(false);
    }
  };

  const handleRecoveryBegin = async () => {
    if (!kitId || !recoveryKey) return;
    setLoading(true);
    setError('');

    try {
      const { otpauthUrl } = await memberRecovery(kitId, recoveryKey);

      try {
        const parsed = new URL(otpauthUrl);
        setManualSecret(parsed.searchParams.get('secret') || '');
      } catch {
        setManualSecret('');
      }

      const dataUrl = await QRCode.toDataURL(otpauthUrl, { width: 240, margin: 1 });
      setQrDataUrl(dataUrl);

      setCode('');
      setStep('recoveryQr');
    } catch (e) {
      setError(isRateLimited(e) ? RATE_LIMIT_MESSAGE : 'Please double-check your KIT ID and recovery key.');
    } finally {
      setLoading(false);
    }
  };

  const handleRecoveryComplete = async () => {
    if (!kitId || code.length !== 6) return;
    setLoading(true);
    setError('');

    try {
      await onboardComplete(kitId, code);
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

  const lostAccessDialog = (
    <AlertDialog open={showLostAccessDialog} onOpenChange={setShowLostAccessDialog}>
      <AlertDialogContent className="rounded-2xl">
        <AlertDialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-status-warn-soft">
            <LifeBuoy className="h-6 w-6 text-status-warn-ink" />
          </div>
          <AlertDialogTitle className="text-center text-lg font-semibold">
            {t("Your old phone won't work for sign-in anymore")}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-center">
            {t("Using a recovery key resets your sign-in. Next, you'll scan a new QR code with your authenticator app. The key you use can't be used again.")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-col gap-2">
          <Button
            className="w-full h-11 font-semibold"
            onClick={() => {
              setShowLostAccessDialog(false);
              setError('');
              setStep('recoveryKey');
            }}
          >
            {t('I understand, continue')}
          </Button>
          <Button variant="outline" className="w-full h-11" onClick={() => setShowLostAccessDialog(false)}>
            {t('Cancel')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (step === 'login') {
    return (
      <>
        <AuthCard
          title="Sign in"
          description="Enter your KIT ID and the 6-digit code from your authenticator app."
          footer={
            <>
              <Button onClick={handleLogin} disabled={loading || !kitId || code.length !== 6} className="w-full h-11 font-semibold">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>{t('Sign in')} <ArrowRight className="ml-2 h-4 w-4" /></>}
              </Button>
              <button
                type="button"
                className="w-full text-sm text-muted-foreground hover:text-primary transition-colors"
                onClick={() => setShowLostAccessDialog(true)}
              >
                {t('Lost your phone? Use a recovery key')}
              </button>
            </>
          }
        >
          <div className="space-y-2">
            <Label htmlFor="kitId">{t('KIT ID')}</Label>
            <Input
              id="kitId"
              placeholder={t('e.g. {example}', { example: 'QS9KAH6' })}
              autoComplete="username"
              className="h-11 font-mono tracking-wider"
              value={kitId}
              onChange={(e) => setKitId(e.target.value.toUpperCase())}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="otp">{t('6-digit code')}</Label>
            <Input
              id="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              className="h-12 text-center text-xl tracking-[0.5em] font-mono"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            />
          </div>
          {errorAlert}
        </AuthCard>
        <AuthNote>
          {t('New here?')} <Link href="/register" className="font-medium text-primary hover:underline">{t('Set up your account')}</Link>
        </AuthNote>
        {lostAccessDialog}
      </>
    );
  }

  if (step === 'recoveryKey') {
    return (
      <>
        <AuthCard
          onBack={() => { setError(''); setStep('login'); }}
          backLabel="Back to sign in"
          title="Recover access"
          description="Enter your KIT ID and one of the recovery keys from your kit card. After this, your old phone can't be used to sign in, and you'll connect your new phone."
          footer={
            <Button disabled={loading || !kitId || !recoveryKey} onClick={handleRecoveryBegin} className="w-full h-11 font-semibold">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>{t('Continue')} <ArrowRight className="ml-2 h-4 w-4" /></>}
            </Button>
          }
        >
          <div className="space-y-2">
            <Label htmlFor="kitIdRecovery">{t('KIT ID')}</Label>
            <Input
              id="kitIdRecovery"
              placeholder={t('e.g. {example}', { example: 'QS9KAH6' })}
              className="h-11 font-mono tracking-wider"
              value={kitId}
              onChange={(e) => setKitId(e.target.value.toUpperCase())}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="recovery">{t('Recovery key')}</Label>
            <Input
              id="recovery"
              placeholder="xxxxx-xxxxx-xxxxx-xxxxx"
              className="h-11 font-mono"
              value={recoveryKey}
              onChange={(e) => setRecoveryKey(e.target.value)} // NOT uppercased — backend key is mixed-case and compared exactly
            />
          </div>
          {errorAlert}
        </AuthCard>
        <AuthNote>
          {t('Have your phone?')} <Link href="/login" className="font-medium text-primary hover:underline">{t('Sign in normally')}</Link>
        </AuthNote>
      </>
    );
  }

  // step === 'recoveryQr'
  return (
    <AuthCard
      step="New phone"
      title="Connect your authenticator app"
      description="Scan this code with Google Authenticator or Microsoft Authenticator, then enter the 6-digit code it shows. Don't close this page until you're done: the recovery key you entered is now used up."
      footer={
        <Button onClick={handleRecoveryComplete} disabled={loading || code.length !== 6} className="w-full h-11 font-semibold">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t('Verify and sign in')}
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
        <Label htmlFor="recoveryOtp">{t('6-digit code')}</Label>
        <Input
          id="recoveryOtp"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="000000"
          className="h-12 text-center text-xl tracking-[0.5em] font-mono"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && handleRecoveryComplete()}
        />
      </div>
      {errorAlert}
    </AuthCard>
  );
}
