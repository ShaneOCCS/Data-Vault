
'use client';

import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ArrowRight, Loader2, LifeBuoy, AlertCircle } from 'lucide-react';
import { verifyMockTOTP } from '@/app/lib/auth-store';
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
import { getAccount, updateAccount, setUserSession, isAccountActive } from '@/app/lib/local-db';

export function LoginFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // /login?recover=1 (from the home page "Recover access" link) goes
  // KIT ID -> warning -> recovery key, instead of KIT ID -> authenticator code.
  const recoverMode = searchParams.get('recover') === '1';
  const [step, setStep] = useState(1); // 1: KIT ID, 2: OTP, 4: Recovery
  const [kitId, setKitId] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showLostAccessDialog, setShowLostAccessDialog] = useState(false);

  const handleNext = async () => {
    if (!kitId) return;
    setLoading(true);
    setError('');
    
    try {
      const account = await getAccount(kitId);
      
      if (!account) {
        setError('Please double-check your KIT ID, or register first if you\'re new here.');
        setLoading(false);
        return;
      }
      
      if (!account.registered) {
        setError('Please complete registration first — this KIT ID isn\'t set up yet.');
        setLoading(false);
        return;
      }

      if (!isAccountActive(account)) {
        setError('This KIT ID has been deactivated. Please contact your administrator for help.');
        setLoading(false);
        return;
      }
      
      if (recoverMode) {
        setShowLostAccessDialog(true);
      } else {
        setStep(2);
      }
    } catch (e: any) {
      setError('Please initialize your database and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!kitId) return;
    setLoading(true);
    setError('');
    
    try {
      const account = await getAccount(kitId);

      if (account && !isAccountActive(account)) {
        setError('This KIT ID has been deactivated. Please contact your administrator for help.');
        setLoading(false);
        return;
      }
      
      if (account && account.secret) {
        const isValid = verifyMockTOTP(account.secret, otpCode);
        if (isValid) {
          setUserSession(account.kitId, account.name);
          router.push('/dashboard');
        } else {
          setError('Please check your authenticator app and re-enter the 6-digit code.');
        }
      }
    } catch (e) {
      setError('Please try again — we couldn\'t verify that code.');
    } finally {
      setLoading(false);
    }
  };

  const handleRecoveryLogin = async () => {
    if (!kitId || !recoveryCode) return;
    setLoading(true);
    setError('');

    try {
      const account = await getAccount(kitId);

      if (account && account.recoveryKeys?.includes(recoveryCode.toUpperCase())) {
        const updatedKeys = account.recoveryKeys.filter((k: string) => k !== recoveryCode.toUpperCase());
        
        // Reset MFA and redirect to re-link for security
        await updateAccount(kitId, {
          recoveryKeys: updatedKeys,
          registered: false,
          secret: null
        });

        router.push(`/register?studentId=${kitId}&relink=true`);
      } else {
        setError('Please double-check your recovery code — it may be invalid or expired.');
      }
    } catch (e) {
      setError('Please try again — recovery wasn\'t successful.');
    } finally {
      setLoading(false);
    }
  };

  const errorAlert = error ? (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  ) : null;

  const lostAccessDialog = (
    <AlertDialog open={showLostAccessDialog} onOpenChange={setShowLostAccessDialog}>
      <AlertDialogContent className="rounded-2xl">
        <AlertDialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50">
            <LifeBuoy className="h-6 w-6 text-amber-600" />
          </div>
          <AlertDialogTitle className="text-center text-lg font-semibold">
            Your old authenticator code will stop working
          </AlertDialogTitle>
          <AlertDialogDescription className="text-center">
            Using a recovery key resets your sign-in. After this you'll scan a new QR code
            to connect your authenticator app again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-col gap-2">
          <Button
            className="w-full h-11 font-semibold"
            onClick={() => {
              setShowLostAccessDialog(false);
              setError('');
              setStep(4);
            }}
          >
            I understand, continue
          </Button>
          <Button variant="outline" className="w-full h-11" onClick={() => setShowLostAccessDialog(false)}>
            Cancel
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (step === 1) {
    return (
      <>
        <AuthCard
          title={recoverMode ? 'Recover access' : 'Sign in'}
          description={
            recoverMode
              ? 'Enter your KIT ID first. Next, you will use one of your recovery keys.'
              : 'Enter the KIT ID printed on your kit card.'
          }
          footer={
            <Button onClick={handleNext} disabled={loading || !kitId} className="w-full h-11 font-semibold">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Continue <ArrowRight className="ml-2 h-4 w-4" /></>}
            </Button>
          }
        >
          <div className="space-y-2">
            <Label htmlFor="kitId">KIT ID</Label>
            <Input
              id="kitId"
              placeholder="e.g. 7KQ4M2X"
              autoComplete="username"
              className="h-11 font-mono tracking-wider"
              value={kitId}
              onChange={(e) => setKitId(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleNext()}
            />
          </div>
          {errorAlert}
        </AuthCard>
        <AuthNote>
          {recoverMode ? (
            <>Have your phone? <Link href="/login" className="font-medium text-primary hover:underline">Sign in normally</Link></>
          ) : (
            <>New here? <Link href="/register" className="font-medium text-primary hover:underline">Set up your account</Link></>
          )}
        </AuthNote>
        {lostAccessDialog}
      </>
    );
  }

  if (step === 4) {
    return (
      <AuthCard
        onBack={() => { setError(''); setStep(1); }}
        backLabel="Change KIT ID"
        title="Use a recovery key"
        description={<>Enter one of the recovery keys for <span className="font-mono font-semibold text-foreground">{kitId}</span>. Each key works once.</>}
        footer={
          <Button disabled={loading || recoveryCode.length < 8} onClick={handleRecoveryLogin} className="w-full h-11 font-semibold">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verify and set up new phone'}
          </Button>
        }
      >
        <div className="space-y-2">
          <Label htmlFor="recovery">Recovery key</Label>
          <Input
            id="recovery"
            placeholder="XXXXXXXX"
            maxLength={8}
            className="h-11 font-mono tracking-wider uppercase"
            value={recoveryCode}
            onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
          />
        </div>
        {errorAlert}
      </AuthCard>
    );
  }

  return (
    <>
      <AuthCard
        onBack={() => { setError(''); setOtpCode(''); setStep(1); }}
        backLabel="Change KIT ID"
        title="Enter your code"
        description={<>Open your authenticator app and enter the 6-digit code for <span className="font-mono font-semibold text-foreground">{kitId}</span>.</>}
        footer={
          <>
            <Button disabled={loading || otpCode.length < 6} onClick={handleLogin} className="w-full h-11 font-semibold">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sign in'}
            </Button>
            <button
              type="button"
              className="w-full text-sm text-muted-foreground hover:text-primary transition-colors"
              onClick={() => setShowLostAccessDialog(true)}
            >
              Lost your phone? Use a recovery key
            </button>
          </>
        }
      >
        <div className="space-y-2">
          <Label htmlFor="otp">6-digit code</Label>
          <Input
            id="otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            className="h-12 text-center text-xl tracking-[0.5em] font-mono"
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && otpCode.length === 6 && handleLogin()}
          />
        </div>
        {errorAlert}
      </AuthCard>
      {lostAccessDialog}
    </>
  );
}
