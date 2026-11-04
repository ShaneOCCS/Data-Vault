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
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ShieldCheck, ArrowRight, Smartphone, Copy, Check, AlertCircle, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useSearchParams, useRouter } from 'next/navigation';
import { isRateLimited, RATE_LIMIT_MESSAGE } from '@/lib/api';
import Link from 'next/link';
import QRCode from 'qrcode'; // NEW: renders the QR entirely in the browser from the server's otpauthUrl — the secret never gets sent to a third-party service like the old api.qrserver.com call did
import { onboardBegin, onboardComplete } from '@/lib/member-api'; // NEW: real backend calls

export function RegistrationFlow() {
  const router = useRouter();
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

  if (step === 1) {
    return (
      <Card className="w-full max-w-md shadow-lg border-primary/10 bg-white/80 backdrop-blur-sm">
        <CardHeader className="space-y-1">
          <div className="bg-primary/10 w-12 h-12 rounded-lg flex items-center justify-center mb-2"><ShieldCheck className="text-primary h-6 w-6" /></div>
          <CardTitle className="text-2xl font-bold text-primary">Vault Registration</CardTitle>
          <CardDescription>Enter your KIT ID and registration code to begin setup.</CardDescription>
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
            <Label htmlFor="signupKey">Registration Code</Label>
            <Input
              id="signupKey"
              placeholder="the one-time code you were given"
              value={signupKey}
              onChange={(e) => setSignupKey(e.target.value)} // NOT uppercased — the backend's key is mixed-case and compared exactly
            />
          </div>
          {error && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button onClick={handleBegin} disabled={loading} className="w-full bg-primary font-bold h-11">
            {loading ? <Loader2 className="animate-spin" /> : <>Continue <ArrowRight className="ml-2 h-4 w-4" /></>}
          </Button>
          <Link href="/login" className="text-xs text-muted-foreground hover:text-primary transition-colors">
            Already registered? Sign in here
          </Link>
        </CardFooter>
      </Card>
    );
  }

  // step 2
  return (
    <Card className="w-full max-w-md shadow-lg border-primary/10 bg-white/80 backdrop-blur-sm">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-4"><div className="bg-accent/10 p-3 rounded-full"><Smartphone className="h-8 w-8 text-primary" /></div></div>
        <CardTitle className="text-2xl font-bold text-primary">Secure Multi-Factor</CardTitle>
        <CardDescription>Scan this QR code with Microsoft or Google Authenticator, then enter the 6-digit code it shows. Please keep this page open until you finish: your registration code only works once, and leaving now means using a recovery key to continue.</CardDescription>
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
          <Label htmlFor="code">6-digit code</Label>
          <Input
            id="code"
            placeholder="123456"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          />
        </div>
        {error && <Alert variant="destructive" className="w-full"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
      </CardContent>
      <CardFooter>
        <Button onClick={handleComplete} disabled={loading || code.length !== 6} className="w-full bg-primary font-bold h-11">
          {loading ? <Loader2 className="animate-spin" /> : 'Verify & Finish Registration'}
        </Button>
      </CardFooter>
    </Card>
  );
}
