'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Shield, Mail, KeyRound, Loader2, AlertCircle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { verifyAdminLogin, setAdminSession, seedDemoAdmins } from '@/app/lib/admin-store';

export default function AdminLoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    try {
      await seedDemoAdmins();
      toast({ variant: 'success', title: "You're All Set", description: 'Please go ahead — the demo admin account is ready to use.' });
    } catch {
      toast({ variant: 'destructive', title: 'Please Try Again', description: "We couldn't write to local storage." });
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Please enter both your email and password to continue.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const admin = await verifyAdminLogin(email, password);
      if (!admin) {
        setError('Please double-check your email and password and try again.');
        setLoading(false);
        return;
      }
      setAdminSession(admin);
      router.push('/admin/dashboard');
    } catch {
      setError("Please try again — we couldn't log you in.");
      setLoading(false);
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
                <h4 className="font-bold text-sm">Demo Admin Login</h4>
                <Button variant="ghost" size="sm" onClick={handleReset} className="text-xs text-primary">INITIALIZE DB</Button>
              </div>
              <div className="space-y-2 text-xs">
                <div className="p-2 bg-muted rounded">
                  <p>Email: <code>admin@gmail.com</code></p>
                  <p>Password: <code>Admin123!</code></p>
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
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
                  placeholder="admin@gmail.com"
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
