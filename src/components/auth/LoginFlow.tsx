
'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { User, KeyRound, ArrowRight, Loader2, LifeBuoy, AlertCircle } from 'lucide-react';
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
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getAccount, updateAccount, setUserSession, isAccountActive } from '@/app/lib/local-db';

export function LoginFlow() {
  const router = useRouter();
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
      
      setStep(2);
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
            work. You'll need to scan a new QR code to set up your authenticator app again.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter className="flex-col sm:flex-col gap-2">
          <Button
            className="w-full bg-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive)/0.9)] font-bold h-11"
            onClick={() => {
              setShowLostAccessDialog(false);
              setStep(4);
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

  if (step === 1) {
    return (
      <>
      <Card className="w-full max-w-md shadow-xl border-primary/5 bg-white/80 backdrop-blur-sm">
        <CardHeader className="space-y-1">
          <div className="bg-primary/10 p-2 rounded-lg w-fit"><User className="text-primary h-6 w-6" /></div>
          <CardTitle className="text-2xl font-bold text-primary">Vault Access</CardTitle>
          <CardDescription>Enter your KIT ID to start the secure session.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="kitId">KIT ID</Label>
            <Input 
              id="kitId" 
              placeholder="e.g. K12345" 
              value={kitId} 
              onChange={(e) => setKitId(e.target.value.toUpperCase())}
            />
          </div>
          {error && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button onClick={handleNext} disabled={loading} className="w-full bg-primary font-bold h-11">
            {loading ? <Loader2 className="animate-spin" /> : <>Continue <ArrowRight className="ml-2 h-4 w-4" /></>}
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

  if (step === 4) {
    return (
      <Card className="w-full max-w-md shadow-xl border-primary/5 bg-white/80 backdrop-blur-sm">
        <CardHeader className="space-y-1">
          <Button variant="ghost" className="w-fit p-0 h-auto text-xs" onClick={() => setStep(1)}>← Back to ID</Button>
          <div className="bg-amber-100 p-2 rounded-lg w-fit"><LifeBuoy className="text-amber-600 h-6 w-6" /></div>
          <CardTitle className="text-2xl font-bold text-primary">Identity Recovery</CardTitle>
          <CardDescription>Enter one of your 8-character recovery keys.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="recovery">Recovery Key</Label>
            <Input 
              id="recovery" 
              placeholder="XXXXXXXX" 
              maxLength={8} 
              className="font-mono text-center text-lg uppercase" 
              value={recoveryCode} 
              onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())} 
            />
          </div>
          {error && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
        </CardContent>
        <CardFooter>
          <Button disabled={loading || recoveryCode.length < 8} onClick={handleRecoveryLogin} className="w-full bg-amber-600 hover:bg-amber-700 font-bold h-11">
            {loading ? <Loader2 className="animate-spin" /> : 'Verify & Reset MFA'}
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <>
    <Card className="w-full max-w-md shadow-xl border-primary/5 bg-white/80 backdrop-blur-sm">
      <CardHeader className="space-y-1">
        <Button variant="ghost" className="w-fit p-0 h-auto text-xs" onClick={() => setStep(1)}>← Change KIT ID</Button>
        <div className="bg-accent/10 p-2 rounded-lg w-fit"><KeyRound className="text-primary h-6 w-6" /></div>
        <CardTitle className="text-2xl font-bold text-primary">MFA Required</CardTitle>
        <CardDescription>Enter the code generated for <strong>{kitId}</strong>.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="otp">6-Digit Code</Label>
          <Input 
            id="otp" 
            maxLength={6} 
            placeholder="000000" 
            className="text-center text-2xl tracking-widest font-mono h-14" 
            value={otpCode} 
            onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))} 
          />
        </div>
        {error && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
      </CardContent>
      <CardFooter className="flex flex-col gap-3">
        <Button disabled={loading || otpCode.length < 6} onClick={handleLogin} className="w-full bg-primary font-bold h-11">
          {loading ? <Loader2 className="animate-spin" /> : 'Confirm Access'}
        </Button>
        <Button variant="link" className="text-xs text-muted-foreground" onClick={() => setShowLostAccessDialog(true)}>
          Lost access to your app? Use a recovery code.
        </Button>
      </CardFooter>
    </Card>
    {lostAccessDialog}
    </>
  );
}
