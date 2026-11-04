'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Shield, Mail, KeyRound, User, Loader2, AlertCircle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { acceptInvite } from '@/lib/admin-api';
import { ApiError, isRateLimited, RATE_LIMIT_MESSAGE } from '@/lib/api';
import { setAdminDisplayCache } from '@/lib/admin-session-cache';

function acceptErrorMessage(e: unknown): string {
  if (isRateLimited(e)) return RATE_LIMIT_MESSAGE;
  if (e instanceof ApiError) {
    if (e.status === 400 || e.status === 409) return e.message; // password rejected, or account already exists
    if (e.status === 401) return 'This invite link is invalid or has expired. Please ask for a new one.';
  }
  return "Something went wrong and your account wasn't created. Please try again.";
}

function AcceptInviteForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [linkRead, setLinkRead] = useState(false);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // The superadmin's link carries #email=...&token=... , which browsers don't
  // send to servers. Older links used ?email=...&token=... and stay valid until
  // they expire. Either way, remove the token from the address bar and history
  // once it's read. This means a refresh needs the original link again.
  useEffect(() => {
    const { hash, search, pathname } = window.location;
    const params = new URLSearchParams(hash ? hash.slice(1) : search);
    setEmail(params.get('email') || '');
    setToken(params.get('token') || '');
    setLinkRead(true);
    window.history.replaceState(null, '', pathname);
  }, []);

  const handleAccept = async () => {
    if (!email || !token) {
      setError('This invite link looks incomplete. Please open the original link again, or ask for a new one.');
      return;
    }
    if (!name.trim()) {
      setError('Please enter your name to continue.');
      return;
    }
    // The backend's limit is in bytes, and non-English characters can take several bytes each.
    const passwordBytes = new TextEncoder().encode(password).length;
    if (passwordBytes < 12 || passwordBytes > 72) {
      setError('Please choose a password between 12 and 72 characters. Accented letters and symbols can count as more than one.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const session = await acceptInvite(email, token, password, name.trim());
      setAdminDisplayCache(session);
      router.push('/admin/dashboard');
    } catch (e) {
      setError(acceptErrorMessage(e));
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <div className="mx-auto bg-primary/10 p-3 rounded-full w-fit mb-2">
          <Shield className="h-6 w-6 text-primary" />
        </div>
        <CardTitle>Accept Admin Invite</CardTitle>
        <CardDescription>Set up your name and password to activate your admin account.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
            <Input id="email" value={email} readOnly className="pl-9 bg-muted" />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="name">Your Name</Label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="name"
              placeholder="Jane Doe"
              className="pl-9"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAccept()}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Choose a Password</Label>
          <div className="relative">
            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="password"
              type="password"
              placeholder="12-72 characters"
              className="pl-9"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAccept()}
            />
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button className="w-full" onClick={handleAccept} disabled={loading || !linkRead}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Activate Account'}
        </Button>
      </CardFooter>
    </Card>
  );
}

export default function AcceptInvitePage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="p-6">
        <Link href="/" className="flex items-center gap-2">
          <div className="bg-primary p-1.5 rounded-lg"><Shield className="h-6 w-6 text-white" /></div>
          <span className="font-bold text-xl text-primary tracking-tighter uppercase">Data Vault</span>
        </Link>
      </header>
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <AcceptInviteForm />
      </main>
    </div>
  );
}
