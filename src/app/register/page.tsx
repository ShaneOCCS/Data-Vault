'use client';

import { RegistrationFlow } from '@/components/auth/RegistrationFlow';
import { Shield } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';

export default function RegisterPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="p-6 flex justify-between items-center">
        <Link href="/" className="flex items-center gap-2 w-fit">
          <div className="bg-primary p-1.5 rounded-lg">
            <Shield className="h-6 w-6 text-white" />
          </div>
          <span className="font-headline font-bold text-xl text-primary">Data Vault</span>
        </Link>
      </header>
      
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full flex flex-col items-center gap-8">
          <Suspense fallback={<div className="text-center">Initializing Setup...</div>}>
            <RegistrationFlow />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
