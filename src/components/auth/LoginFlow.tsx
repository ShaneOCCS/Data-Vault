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
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { User, ArrowRight, Loader2, LifeBuoy, AlertCircle, Smartphone, Copy, Check } from 'lucide-react'; // KeyRound dropped — no longer used (old separate OTP-screen icon)
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import QRCode from 'qrcode'; // NEW: renders the QR client-side from the server's otpauthUrl, same approach as RegistrationFlow.tsx
import { memberLogin, memberRecovery, onboardComplete } from '@/lib/member-api'; // NEW: real backend calls
import { isRateLimited, RATE_LIMIT_MESSAGE } from '@/lib/api';

type Step = 'login' | 'recoveryKey' | 'recoveryQr';

export function LoginFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('login');
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

  const lostAccessDialog = (
    <AlertDialog open={showLostAccessDialog} onOpenChange={setShowLostAccessDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex justify-center mb-2">
            <div className="bg-[hsl(var(--destructive)/0.1)] p-3 rounded-full">
              <LifeBuoy className="h-8 w-8 text-[hsl(var(--destructive))]" />
            </div>
          </div>

          <AlertDialogTitle className="text-center text-xl">
            Your old authenticator code will stop working
          </AlertDialogTitle>

          <AlertDialogDescription className="text-center">
            Recovering your account will reset your multi-factor authentication (MFA).
            After recovery, the code from your current authenticator app will no longer
            work. You&apos;ll need to scan a new QR code to set up your authenticator app again.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter className="flex-col sm:flex-col gap-2">
          <Button
            className="w-full bg-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive)/0.9)] font-bold h-11"
            onClick={() => {
              setShowLostAccessDialog(false);
              setError('');
              setStep('recoveryKey');
            }}
          >
            I understand, continue
          </Button>

          <Button
            variant="outline"
            className="w-full bg-white text-black border-gray-300 hover:bg-white hover:text-black focus:bg-white focus:text-black active:bg-white active:text-black"
            onClick={() => setShowLostAccessDialog(false)}
          >
            Cancel
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (step === 'login') {
    return (
      <>
      <Card className="w-full max-w-md shadow-xl border-primary/5 bg-white/80 backdrop-blur-sm">
        <CardHeader className="space-y-1">
          <div className="bg-primary/10 p-2 rounded-lg w-fit"><User className="text-primary h-6 w-6" /></div>
          <CardTitle className="text-2xl font-bold text-primary">Vault Access</CardTitle>
          <CardDescription>Enter your KIT ID and the code from your authenticator app.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="kitId">KIT ID</Label>
            <Input
              id="kitId"
              placeholder="e.g. QS9KAH6"
              value={kitId}
              onChange={(e) => setKitId(e.target.value.toUpperCase())}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="otp">6-Digit Code</Label>
            <Input
              id="otp"
              maxLength={6}
              placeholder="000000"
              className="text-center text-2xl tracking-widest font-mono h-14"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
          </div>
          {error && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button onClick={handleLogin} disabled={loading || !kitId || code.length !== 6} className="w-full bg-primary font-bold h-11">
            {loading ? <Loader2 className="animate-spin" /> : <>Continue <ArrowRight className="ml-2 h-4 w-4" /></>}
          </Button>
          <Button variant="link" className="text-xs text-muted-foreground" onClick={() => setShowLostAccessDialog(true)}>
            Lost access to your app? Use a recovery code.
          </Button>
          <div className="flex flex-col items-center gap-2 mt-2 w-full">
            <Link href="/register" className="text-xs text-muted-foreground hover:text-primary transition-colors">
              First-time setup? Register KIT ID
            </Link>
          </div>
        </CardFooter>
      </Card>
      {lostAccessDialog}
      </>
    );
  }

  if (step === 'recoveryKey') {
    return (
      <Card className="w-full max-w-md shadow-xl border-primary/5 bg-white/80 backdrop-blur-sm">
        <CardHeader className="space-y-1">
          <Button variant="ghost" className="w-fit p-0 h-auto text-xs" onClick={() => { setStep('login'); setError(''); }}>← Back to login</Button>
          <div className="bg-amber-100 p-2 rounded-lg w-fit"><LifeBuoy className="text-amber-600 h-6 w-6" /></div>
          <CardTitle className="text-2xl font-bold text-primary">Identity Recovery</CardTitle>
          <CardDescription>Enter your KIT ID and one of your recovery keys.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="kitIdRecovery">KIT ID</Label>
            <Input
              id="kitIdRecovery"
              placeholder="e.g. QS9KAH6"
              value={kitId}
              onChange={(e) => setKitId(e.target.value.toUpperCase())}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="recovery">Recovery Key</Label>
            <Input
              id="recovery"
              placeholder="the recovery key you were given"
              className="font-mono"
              value={recoveryKey}
              onChange={(e) => setRecoveryKey(e.target.value)} // NOT uppercased — backend key is mixed-case and compared exactly
            />
          </div>
          {error && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
        </CardContent>
        <CardFooter>
          <Button disabled={loading || !kitId || !recoveryKey} onClick={handleRecoveryBegin} className="w-full bg-amber-600 hover:bg-amber-700 font-bold h-11">
            {loading ? <Loader2 className="animate-spin" /> : 'Continue'}
          </Button>
        </CardFooter>
      </Card>
    );
  }

  // step === 'recoveryQr'
  return (
    <Card className="w-full max-w-md shadow-xl border-primary/5 bg-white/80 backdrop-blur-sm">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-4"><div className="bg-accent/10 p-3 rounded-full"><Smartphone className="h-8 w-8 text-primary" /></div></div>
        <CardTitle className="text-2xl font-bold text-primary">Set Up New MFA</CardTitle>
        <CardDescription>Scan this QR code with your authenticator app, then enter the 6-digit code it shows. Please keep this page open until you finish: your recovery key has been used, and leaving now means using another one.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center space-y-6">
        <div className="p-4 bg-white rounded-xl border-2 border-dashed border-primary/20">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="Scan with your authenticator app" className="w-48 h-48" />
          ) : (
            <div className="w-48 h-48 flex items-center justify-center text-xs text-muted-foreground">Generating QR…</div>
          )}
        </div>
        {manualSecret && (
          <div className="w-full bg-muted/50 p-4 rounded-lg space-y-2">
            <p className="text-[10px] font-black text-muted-foreground uppercase text-center">Can&apos;t scan? Enter manually</p>
            <div className="flex items-center justify-between bg-white border rounded px-3 py-2">
              <code className="text-primary font-mono text-sm font-bold break-all">{manualSecret}</code>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => copyToClipboard(manualSecret)}>
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        )}
        <div className="w-full space-y-2">
          <Label htmlFor="recoveryOtp">6-digit code</Label>
          <Input
            id="recoveryOtp"
            maxLength={6}
            placeholder="000000"
            className="text-center text-2xl tracking-widest font-mono h-14"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          />
        </div>
        {error && <Alert variant="destructive" className="w-full"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
      </CardContent>
      <CardFooter>
        <Button onClick={handleRecoveryComplete} disabled={loading || code.length !== 6} className="w-full bg-primary font-bold h-11">
          {loading ? <Loader2 className="animate-spin" /> : 'Verify & Sign In'}
        </Button>
      </CardFooter>
    </Card>
  );
}
