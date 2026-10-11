
'use client';

import { LoginFlow } from '@/components/auth/LoginFlow';
import { Shield, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { seedDemoAccounts } from '@/app/lib/local-db';

function LoginContent() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const isLoggedOut = searchParams.get('logout') === 'success';

  const handleReset = async () => {
    try {
      await seedDemoAccounts();
      toast({ variant: 'success', title: "You're All Set", description: 'Please go ahead — the demo KIT IDs are initialized.' });
    } catch (e) {
      toast({ variant: "destructive", title: "Please Try Again", description: "We couldn't write to local storage." });
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="p-6 flex justify-between items-center">
        <Link href="/" className="flex items-center gap-2">
          <div className="bg-primary p-1.5 rounded-lg"><Shield className="h-6 w-6 text-white" /></div>
          <span className="font-bold text-xl text-primary tracking-tighter uppercase">Data Vault</span>
        </Link>
        <Popover>
          <PopoverTrigger asChild><Button variant="outline" size="sm">Demo Credentials</Button></PopoverTrigger>
          <PopoverContent className="w-80">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-sm">Valid KIT IDs</h4>
                <Button variant="ghost" size="sm" onClick={handleReset} className="text-xs text-primary">INITIALIZE DB</Button>
              </div>
              <div className="space-y-2 text-xs">
                <div className="p-2 bg-muted rounded"><p>KIT ID: <code>K12345</code></p><p>Reg Code: <code>ABCD-1234</code></p></div>
                <div className="p-2 bg-muted rounded"><p>KIT ID: <code>K98765</code></p><p>Reg Code: <code>WXYZ-5678</code></p></div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </header>
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full flex flex-col items-center gap-8">
          {isLoggedOut && <div className="bg-green-50 text-green-700 px-4 py-3 rounded-lg flex items-center gap-3"><CheckCircle2 className="h-5 w-5" /><span>Secure Logout Complete.</span></div>}
          <LoginFlow />
        </div>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense fallback={<div className="flex items-center justify-center h-screen">Loading Portal...</div>}><LoginContent /></Suspense>;
}
