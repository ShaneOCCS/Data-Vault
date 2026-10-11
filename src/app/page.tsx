import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Shield, Smartphone, Lock, GraduationCap, ChevronRight, UserPlus } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Navigation */}
      <nav className="border-b bg-white/50 backdrop-blur-md sticky top-0 z-50">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-primary rounded-lg p-1.5">
              <Shield className="h-6 w-6 text-white" />
            </div>
            <span className="font-headline font-bold text-xl text-primary">Data Vault</span>
          </div>
          <div className="flex gap-4 items-center">
            <Button variant="ghost" asChild className="hidden sm:inline-flex">
              <Link href="/register">First-Time Setup</Link>
            </Button>
            <Button asChild className="bg-primary hover:bg-primary/90">
              <Link href="/login">Login</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/admin/login">Admin Login</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center relative overflow-hidden">
        <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 w-[600px] h-[600px] bg-accent/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 translate-y-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-primary/5 rounded-full blur-3xl pointer-events-none" />

        <div className="container mx-auto px-6 py-20 text-center space-y-8 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-accent/10 border border-accent/20 rounded-full text-primary text-sm font-semibold mb-4 animate-bounce">
            <Lock className="h-3 w-3" /> Military-Grade Encryption
          </div>
          
          <h1 className="text-5xl md:text-7xl font-headline font-extrabold text-primary tracking-tight max-w-4xl mx-auto leading-tight">
            The Secure Access Point for Your <span className="text-accent underline decoration-primary/10">Private Data</span>
          </h1>
          
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Access your records and secure vaults with industry-standard 
            multi-factor authentication. No passwords needed, just your KIT ID.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Button size="lg" asChild className="bg-primary hover:bg-primary/90 text-lg px-8 py-7 h-auto rounded-xl font-bold group shadow-lg shadow-primary/20">
              <Link href="/login">
                Access Vault <ChevronRight className="ml-2 group-hover:translate-x-1 transition-transform" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="text-lg px-8 py-7 h-auto rounded-xl font-bold border-primary/20 hover:bg-primary/5">
              <Link href="/register">
                <UserPlus className="mr-2 h-5 w-5" /> First-Time Setup
              </Link>
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-24 max-w-6xl mx-auto text-left">
            <div className="p-8 rounded-2xl bg-white border border-primary/5 shadow-sm hover:shadow-md transition-shadow group">
              <div className="bg-primary/10 w-12 h-12 rounded-xl flex items-center justify-center mb-6 group-hover:bg-primary transition-colors">
                <Smartphone className="h-6 w-6 text-primary group-hover:text-white" />
              </div>
              <h3 className="text-xl font-bold text-primary mb-2">Authenticator-Based</h3>
              <p className="text-muted-foreground">Log in securely using time-based codes from Microsoft Authenticator or Google Authenticator.</p>
            </div>
            
            <div className="p-8 rounded-2xl bg-white border border-primary/5 shadow-sm hover:shadow-md transition-shadow group">
              <div className="bg-primary/10 w-12 h-12 rounded-xl flex items-center justify-center mb-6 group-hover:bg-primary transition-colors">
                <GraduationCap className="h-6 w-6 text-primary group-hover:text-white" />
              </div>
              <h3 className="text-xl font-bold text-primary mb-2">KIT ID Integration</h3>
              <p className="text-muted-foreground">No personal email required. Your institutional KIT ID is your unique key to the vault.</p>
            </div>
            
            <div className="p-8 rounded-2xl bg-white border border-primary/5 shadow-sm hover:shadow-md transition-shadow group">
              <div className="bg-primary/10 w-12 h-12 rounded-xl flex items-center justify-center mb-6 group-hover:bg-primary transition-colors">
                <Shield className="h-6 w-6 text-primary group-hover:text-white" />
              </div>
              <h3 className="text-xl font-bold text-primary mb-2">Zero Trust Architecture</h3>
              <p className="text-muted-foreground">State-of-the-art security ensures that only verified owners can access their private records.</p>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t py-12 bg-white/50">
        <div className="container mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <span className="font-bold text-primary">Data Vault Portal</span>
          </div>
          <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} Vault Security Services. All rights reserved.</p>
          <div className="flex gap-6 text-sm font-medium text-muted-foreground">
            <Link href="#" className="hover:text-primary transition-colors">Privacy</Link>
            <Link href="#" className="hover:text-primary transition-colors">Terms</Link>
            <Link href="#" className="hover:text-primary transition-colors">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
