
'use client';

import { LoginFlow } from '@/components/auth/LoginFlow';
import { Shield, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function LoginContent() {
  const searchParams = useSearchParams();
  const isLoggedOut = searchParams.get('logout') === 'success';

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="p-6 flex justify-between items-center">
        <Link href="/" className="flex items-center gap-2">
          <div className="bg-primary p-1.5 rounded-lg"><Shield className="h-6 w-6 text-white" /></div>
          <span className="font-bold text-xl text-primary tracking-tighter uppercase">Data Vault</span>
        </Link>
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
