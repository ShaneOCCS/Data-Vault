'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Shield, Mail, KeyRound, Loader2, AlertCircle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { adminLogin } from '@/lib/admin-api';
import { isRateLimited, RATE_LIMIT_MESSAGE } from '@/lib/api';
import { setAdminDisplayCache } from '@/lib/admin-session-cache';

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
    <div className="min-h-screen bg-background flex flex-col">
      <header className="p-6">
        <Link href="/" className="flex items-center gap-2">
          <div className="bg-primary p-1.5 rounded-lg"><Shield className="h-6 w-6 text-white" /></div>
          <span className="font-bold text-xl text-primary tracking-tighter uppercase">Data Vault</span>
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <div className="mx-auto bg-primary/10 p-3 rounded-full w-fit mb-2">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>Admin Portal</CardTitle>
            <CardDescription>Sign in with your admin email and password.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {sessionExpired && !error && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>Your session has ended. Please sign in again.</AlertDescription>
              </Alert>
            )}
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@example.com"
                  className="pl-9"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  className="pl-9"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                />
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button className="w-full" onClick={handleLogin} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sign In'}
            </Button>
          </CardFooter>
        </Card>
      </main>
    </div>
  );
}
