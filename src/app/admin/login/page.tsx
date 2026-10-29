'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { verifyAdminLogin, setAdminSession } from '@/app/lib/admin-store';
import { AuthShell, AuthCard, AuthNote, type AuthPanel } from '@/components/site/SiteShell';

const panel: AuthPanel = {
  title: 'Staff access',
  intro: 'For clinic and admin staff only.',
  points: [
    { title: 'Create KIT IDs', body: 'Generate KIT IDs and setup codes for new kits.' },
    { title: 'Share results', body: 'Upload documents to a KIT ID so its owner can download them.' },
    { title: 'Manage access', body: 'Turn sign-in on or off for any KIT ID.' },
  ],
  help: <>Need an account? Ask an existing admin to send you an invite.</>,
};

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Enter your email and password.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const admin = await verifyAdminLogin(email, password);
      if (!admin) {
        setError('That email and password don’t match. Try again.');
        setLoading(false);
        return;
      }
      setAdminSession(admin);
      router.push('/admin/dashboard');
    } catch {
      setError('We couldn’t reach the server. Try again in a moment.');
      setLoading(false);
    }
  };

  return (
    <AuthShell showStaffLink={false} panel={panel}>
      <AuthCard
        step="Staff"
        title="Staff sign in"
        description="For clinic and admin staff. Patients sign in with their KIT ID instead."
        footer={
          <Button className="w-full h-11 font-semibold" onClick={handleLogin} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sign in'}
          </Button>
        }
      >
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
