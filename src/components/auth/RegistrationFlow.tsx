
'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ShieldCheck, ArrowRight, CheckCircle2, Copy, Smartphone, AlertTriangle, AlertCircle, Check, Loader2, Download } from 'lucide-react';
import { generateSecret, generateRecoveryKeys } from '@/app/lib/auth-store';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
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
        setError('Please use the Demo Credentials button on the login page to seed sample data first.');
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

  if (step === 1) {
    return (
      <Card className="w-full max-w-md shadow-lg border-primary/10 bg-white/80 backdrop-blur-sm">
        <CardHeader className="space-y-1">
          <div className="bg-primary/10 w-12 h-12 rounded-lg flex items-center justify-center mb-2"><ShieldCheck className="text-primary h-6 w-6" /></div>
          <CardTitle className="text-2xl font-bold text-primary">{isRelink ? 'MFA Re-setup' : 'Vault Registration'}</CardTitle>
          <CardDescription>Verify your KIT ID to initialize secure access.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="kitId">KIT ID</Label>
            <Input 
              id="kitId" 
              placeholder="e.g. K12345" 
              value={kitId} 
              onChange={(e) => setKitId(e.target.value.toUpperCase())} 
              disabled={isRelink} 
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="regCode">Registration Code</Label>
            <Input 
              id="regCode" 
              placeholder="ABCD-1234" 
              value={regCode} 
              onChange={(e) => setRegCode(e.target.value.toUpperCase())} 
            />
          </div>
          {error && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button onClick={handleVerify} disabled={loading} className="w-full bg-primary font-bold h-11">
            {loading ? <Loader2 className="animate-spin" /> : <>Verify Identity <ArrowRight className="ml-2 h-4 w-4" /></>}
          </Button>
          <Link href="/login" className="text-xs text-muted-foreground hover:text-primary transition-colors">
            Already registered? Sign in here
          </Link>
        </CardFooter>
      </Card>
    );
  }

  if (step === 2) {
    return (
      <Card className="w-full max-w-md shadow-lg border-primary/10 bg-white/80 backdrop-blur-sm">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4"><div className="bg-accent/10 p-3 rounded-full"><Smartphone className="h-8 w-8 text-primary" /></div></div>
          <CardTitle className="text-2xl font-bold text-primary">Secure Multi-Factor</CardTitle>
          <CardDescription>Scan this QR code with Microsoft or Google Authenticator.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center space-y-6">
          <div className="p-4 bg-white rounded-xl border-2 border-dashed border-primary/20">
            <img src={qrUrl} alt="QR" className="w-48 h-48" />
          </div>
          <div className="w-full bg-muted/50 p-4 rounded-lg space-y-2">
            <p className="text-[10px] font-black text-muted-foreground uppercase text-center">Manual Entry Secret</p>
            <div className="flex items-center justify-between bg-white border rounded px-3 py-2">
              <code className="text-primary font-mono text-sm font-bold">{secret}</code>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyToClipboard(secret)}>
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button onClick={handleComplete} disabled={loading} className="w-full bg-primary font-bold h-11">
            {loading ? <Loader2 className="animate-spin" /> : "I've Scanned the QR Code"}
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md shadow-lg border-primary/10 bg-white/80 backdrop-blur-sm">
      <CardContent className="pt-10 flex flex-col items-center text-center space-y-6">
        <div className="bg-green-100 p-4 rounded-full"><CheckCircle2 className="h-16 w-16 text-green-600" /></div>
        <h2 className="text-2xl font-bold text-primary">Security Setup Complete</h2>
        <div className="w-full space-y-4">
          <Alert className="bg-amber-50 border-amber-200">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-amber-700 font-bold">Action Required: Save Keys</AlertTitle>
          </Alert>
          <div className="grid gap-2 p-4 bg-muted/50 rounded-lg border font-mono text-primary font-bold">
            {recoveryKeys.map((key, i) => (
              <div key={i} className="bg-white p-2 px-4 rounded border flex justify-between items-center">
                <span>{key}</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(key)}>
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
          <Button
            variant="outline"
            className="w-full border-primary/20 text-primary font-bold"
            onClick={downloadKeysAsTxt}
          >
            <Download className="mr-2 h-4 w-4" /> Download Keys as .txt
          </Button>
        </div>
        <Button 
          className="w-full bg-primary font-bold h-12" 
          onClick={() => setShowConfirmDialog(true)}
        >
          Next <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </CardContent>

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex justify-center mb-2">
              <div className="bg-amber-100 p-3 rounded-full">
                <AlertTriangle className="h-8 w-8 text-amber-600" />
              </div>
            </div>
            <AlertDialogTitle className="text-center text-xl">
              Are you sure you've saved your keys?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center">
              If you lose these recovery keys, you will <span className="font-bold text-destructive">not</span> be able to recover your account. Data Vault cannot restore access without them.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="flex items-start space-x-3 text-left p-4 bg-amber-50 rounded-lg border border-amber-200">
            <Checkbox
              id="confirm-saved"
              checked={confirmChecked}
              onCheckedChange={(checked) => setConfirmChecked(checked === true)}
            />
            <Label htmlFor="confirm-saved" className="text-xs font-medium cursor-pointer">
              Yes, I understand. I have saved my recovery keys securely and I accept that losing them means losing access to my account.
            </Label>
          </div>

          <AlertDialogFooter className="flex-col sm:flex-col gap-2">
            <Button
              className="w-full bg-primary font-bold h-11"
              disabled={!confirmChecked}
              onClick={() => router.push('/login')}
            >
              Finish & Return to Login
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setShowConfirmDialog(false);
                setConfirmChecked(false);
              }}
            >
              Go Back
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
