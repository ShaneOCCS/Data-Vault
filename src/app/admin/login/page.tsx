'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, AlertCircle } from 'lucide-react';
import { AuthShell, AuthCard, AuthNote, type AuthPanel } from '@/components/site/SiteShell';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { adminLogin } from '@/lib/admin-api';
import { isRateLimited, RATE_LIMIT_MESSAGE } from '@/lib/api';
import { setAdminDisplayCache } from '@/lib/admin-session-cache';

const panel: AuthPanel = {
  title: 'Staff access',
  intro: 'For clinic and admin staff only.',
  points: [
    { title: 'Create KIT IDs', body: 'Generate KIT IDs with setup codes and recovery keys for new kits.' },
    { title: 'Upload results', body: 'Upload a CSV to a KIT ID so its owner can see it on their dashboard.' },
    { title: 'Manage access', body: 'See every KIT ID, top up recovery keys and manage other admins.' },
  ],
  help: <>Need an account? Ask a super admin to send you an invite.</>,
};

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    setSessionExpired(new URLSearchParams(window.location.search).get('expired') === '1');
  }, []);

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Please enter both your email and password to continue.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      // Real backend call — sets the httpOnly session cookie on success
      // Emails aren't lowercased here: accounts created before invites were
      // normalized may have capitals, and the backend matches them exactly.
      const session = await adminLogin(email.trim(), password);
      setAdminDisplayCache(session); // cache {email, name} for display only
      router.push('/admin/dashboard');
    } catch (e) {
      // Generic message on purpose: don't tell an attacker whether the email exists
      setError(isRateLimited(e) ? RATE_LIMIT_MESSAGE : 'Please double-check your email and password and try again.');
      setLoading(false);
    }
  };

  return (
    <AuthShell showStaffLink={false} panel={panel}>
      <AuthCard
        step="Staff"
        title="Staff sign in"
        description="Sign in with your admin email and password."
        footer={
          <Button className="w-full h-11 font-semibold" onClick={handleLogin} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sign in'}
          </Button>
        }
      >
        {sessionExpired && !error && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>Your session has ended. Please sign in again.</AlertDescription>
          </Alert>
        )}
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            placeholder="name@clinic.com"
            className="h-11"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            className="h-11"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
          />
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </AuthCard>
      <AuthNote>
        Not staff? <Link href="/login" className="font-medium text-primary hover:underline">Patient sign in</Link>
      </AuthNote>
    </AuthShell>
  );
}
