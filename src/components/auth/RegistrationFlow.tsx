
'use client';

import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ArrowRight, Copy, AlertTriangle, AlertCircle, Check, Loader2, Download } from 'lucide-react';
import { AuthCard, AuthNote } from '@/components/site/SiteShell';
import { generateSecret, generateRecoveryKeys } from '@/app/lib/auth-store';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useSearchParams, useRouter } from 'next/navigation';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog';
import Link from 'next/link';
import { getAccount, updateAccount } from '@/app/lib/local-db';

export function RegistrationFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [step, setStep] = useState(1);
  const [kitId, setKitId] = useState('');
  const [regCode, setRegCode] = useState('');
  const [error, setError] = useState('');
  const [secret, setSecret] = useState('');
  const [recoveryKeys, setRecoveryKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [isRelink, setIsRelink] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);

  useEffect(() => {
    const id = searchParams.get('studentId');
    if (id) setKitId(id);
    if (searchParams.get('relink') === 'true') {
      setIsRelink(true);
      // Recovery code already verified identity — skip straight to new QR setup.
      setStep(2);
    }
    
    // Generate a unique secret for this registration session
    setSecret(generateSecret());
  }, [searchParams]);

  const handleVerify = async () => {
    if (!kitId || !regCode) return;
    setLoading(true);
    setError('');

    try {
      const account = await getAccount(kitId);

      if (!account) {
        setError("We couldn't find that KIT ID. Check the card that came with your kit.");
        return;
      }

      if (account.registered && !isRelink) {
        setError('This KIT ID is already active — please sign in instead.');
        return;
      }

      if (account.registrationCode === regCode.toUpperCase()) {
        setStep(2);
      } else {
        setError('Please double-check your registration code and try again.');
      }
    } catch (e) {
      setError('Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async () => {
    if (!kitId) return;
    setLoading(true);
    
    try {
      const keys = generateRecoveryKeys(3);
      setRecoveryKeys(keys);
      
      await updateAccount(kitId, {
        secret,
        registered: true,
        recoveryKeys: keys
      });
      
      setStep(3);
    } catch (e) {
      setError('Please try again — we couldn\'t save your security data.');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadKeysAsTxt = () => {
    const content = [
      'Data Vault - Recovery Keys',
      `KIT ID: ${kitId}`,
      `Generated: ${new Date().toLocaleString()}`,
      '',
      'Keep these keys safe. Each one can be used once to regain access if you lose your authenticator.',
      '',
      ...recoveryKeys.map((key, i) => `${i + 1}. ${key}`),
    ].join('\n');

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `data-vault-recovery-keys-${kitId || 'account'}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // QR Code URL based on the unique secret
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=otpauth://totp/DataVault:${kitId}?secret=${secret}&issuer=DataVault`;

  const errorAlert = error ? (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  ) : null;

  const stepLabel = (n: number) => (isRelink ? `New phone · step ${n - 1} of 2` : `Step ${n} of 3`);

  if (step === 1) {
    return (
      <>
        <AuthCard
          step={stepLabel(1)}
          title="Set up your account"
          description="Enter the KIT ID and setup code from the card that came with your kit."
          footer={
            <Button onClick={handleVerify} disabled={loading || !kitId || !regCode} className="w-full h-11 font-semibold">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Continue <ArrowRight className="ml-2 h-4 w-4" /></>}
            </Button>
          }
        >
          <div className="space-y-2">
            <Label htmlFor="kitId">KIT ID</Label>
            <Input
              id="kitId"
              placeholder="e.g. 7KQ4M2X"
              className="h-11 font-mono tracking-wider"
              value={kitId}
              onChange={(e) => setKitId(e.target.value.toUpperCase())}
              disabled={isRelink}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="regCode">Setup code</Label>
            <Input
              id="regCode"
              placeholder="xxxxx-xxxxx-xxxxx-xxxxx"
              className="h-11 font-mono tracking-wider"
              value={regCode}
              onChange={(e) => setRegCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
            />
          </div>
          {errorAlert}
        </AuthCard>
        <AuthNote>
          Already set up? <Link href="/login" className="font-medium text-primary hover:underline">Sign in</Link>
        </AuthNote>
      </>
    );
  }

  if (step === 2) {
    return (
      <AuthCard
        step={stepLabel(2)}
        title="Connect your authenticator app"
        description="Open Google Authenticator or Microsoft Authenticator, tap + and scan this code."
        footer={
          <Button onClick={handleComplete} disabled={loading} className="w-full h-11 font-semibold">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "I've scanned it"}
          </Button>
        }
      >
        <div className="flex justify-center">
          <div className="rounded-xl border p-3">
            <img src={qrUrl} alt="QR code for your authenticator app" className="h-44 w-44" />
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Can't scan? Type this key into the app instead:</p>
          <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2">
            <code className="font-mono text-sm font-semibold break-all">{secret}</code>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => copyToClipboard(secret)} aria-label="Copy key">
              {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        {errorAlert}
      </AuthCard>
    );
  }

  return (
    <>
      <AuthCard
        step={stepLabel(3)}
        title="Save your recovery keys"
        description="If you lose your phone, one of these keys gets you back in. Each works once. We can't show them again."
        footer={
          <>
            <Button variant="outline" className="w-full h-11 font-semibold" onClick={downloadKeysAsTxt}>
              <Download className="mr-2 h-4 w-4" /> Download as .txt
            </Button>
            <Button className="w-full h-11 font-semibold" onClick={() => setShowConfirmDialog(true)}>
              I've saved them <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </>
        }
      >
        <ul className="divide-y rounded-xl border">
          {recoveryKeys.map((key, i) => (
            <li key={i} className="flex items-center justify-between px-4 py-2.5">
              <span className="font-mono text-sm font-semibold tracking-wider">{key}</span>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyToClipboard(key)} aria-label="Copy key">
                <Copy className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      </AuthCard>

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50">
              <AlertTriangle className="h-6 w-6 text-amber-600" />
            </div>
            <AlertDialogTitle className="text-center text-lg font-semibold">
              Have you saved your keys?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center">
              Without them, a lost phone means you can't get back into your account. We can't reset it for you.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="flex items-start gap-3 rounded-xl border p-4">
            <Checkbox
              id="confirm-saved"
              checked={confirmChecked}
              onCheckedChange={(checked) => setConfirmChecked(checked === true)}
            />
            <Label htmlFor="confirm-saved" className="text-sm font-normal leading-snug cursor-pointer">
              I've saved my recovery keys somewhere safe.
            </Label>
          </div>

          <AlertDialogFooter className="flex-col sm:flex-col gap-2">
            <Button className="w-full h-11 font-semibold" disabled={!confirmChecked} onClick={() => router.push('/login')}>
              Finish and sign in
            </Button>
            <Button
              variant="outline"
              className="w-full h-11"
              onClick={() => {
                setShowConfirmDialog(false);
                setConfirmChecked(false);
              }}
            >
              Go back
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
