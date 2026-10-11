
'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Shield, 
  BookOpen, 
  Calendar, 
  Bell, 
  LogOut, 
  Search, 
  User, 
  Smartphone, 
  Share2, 
  Copy,
  CheckCircle2,
  FileText,
  Download
} from 'lucide-react';
import Link from 'next/link';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getUserSession } from '@/app/lib/local-db';
import { getDocumentsForKit, type VaultDocument } from '@/app/lib/document-store';

export default function DashboardPage() {
  const { toast } = useToast();
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [session, setSession] = useState<{ kitId: string; name: string } | null>(null);
  const [documents, setDocuments] = useState<VaultDocument[]>([]);

  useEffect(() => {
    const s = getUserSession();
    setSession(s);
    if (s) {
      getDocumentsForKit(s.kitId).then(setDocuments);
    }
  }, []);

  const handleCopyLink = () => {
    const url = typeof window !== 'undefined' ? window.location.origin : '';
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast({
      variant: 'success',
      title: "Link Copied",
      description: "Please share this link to grant vault access.",
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLogout = () => {
    toast({
      title: "Securing Your Session",
      description: "Please wait a moment while we log you out.",
    });
    setTimeout(() => {
      router.push('/login?logout=success');
    }, 1000);
  };


  return (
    <div className="min-h-screen flex bg-[#F4F6F9]">
      <aside className="w-64 bg-primary text-white hidden lg:flex flex-col p-6">
        <div className="flex items-center gap-2 mb-10">
          <Shield className="h-8 w-8 text-accent" />
          <span className="font-headline font-bold text-xl uppercase tracking-tighter">Data Vault</span>
        </div>
        
        <nav className="flex-1 space-y-2">
          <Link href="#" className="flex items-center gap-3 px-4 py-3 bg-white/10 rounded-xl font-medium">
            <BookOpen className="h-5 w-5" /> Secured Data
          </Link>
          <Link href="#" className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 rounded-xl font-medium transition-colors">
            <Calendar className="h-5 w-5" /> Access Logs
          </Link>
          <Link href="#" className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 rounded-xl font-medium transition-colors">
            <Bell className="h-5 w-5" /> Security Alerts
          </Link>
          <Link href="#" className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 rounded-xl font-medium transition-colors">
            <User className="h-5 w-5" /> Vault Profile
          </Link>
        </nav>
        
        <Button 
          variant="ghost" 
          onClick={handleLogout}
          className="text-white hover:bg-white/10 justify-start px-4"
        >
          <LogOut className="mr-3 h-5 w-5" /> Secure Logout
        </Button>
      </aside>

      <main className="flex-1 flex flex-col">
        <header className="h-16 bg-white border-b px-8 flex items-center justify-between shadow-sm">
          <div className="relative w-96">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input 
              placeholder="Search vault..." 
              className="w-full bg-muted/50 border-none rounded-lg h-10 pl-10 pr-4 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
            />
          </div>
          <div className="flex items-center gap-4">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 border-primary/20 text-primary hover:bg-primary/5">
                  <Share2 className="h-4 w-4" /> Share Access
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Share Vault Access</DialogTitle>
                  <DialogDescription>
                    Invite trusted individuals to this secure environment.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="p-4 bg-muted/50 rounded-lg border border-dashed border-primary/20 flex items-center justify-between">
                    <code className="text-sm font-bold text-primary truncate mr-4">
                      {typeof window !== 'undefined' ? window.location.origin : 'Loading...'}
                    </code>
                    <Button size="icon" variant="ghost" onClick={handleCopyLink}>
                      {copied ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            
            <div className="bg-accent/20 p-2 rounded-full">
              <Bell className="h-5 w-5 text-primary" />
            </div>
            <div className="flex items-center gap-3 pl-4 border-l">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-bold text-primary">{session?.name || 'KIT Authorized User'}</p>
                <p className="text-xs text-muted-foreground uppercase">{session?.kitId || 'KIT ID SECURED'}</p>
              </div>
              <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold">
                DV
              </div>
            </div>
          </div>
        </header>

        <div className="p-8 space-y-8">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-headline font-bold text-primary">Vault Overview</h1>
            <div className="flex gap-2">
              <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full font-bold flex items-center gap-1">
                <Shield className="h-3 w-3" /> Secure Session Active
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="border-none shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold text-muted-foreground uppercase">Storage Health</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-4xl font-headline font-black text-primary">99.9%</p>
                <p className="text-xs text-green-600 font-bold mt-1">Encrypted and redundant</p>
              </CardContent>
            </Card>
            
            <Card className="border-none shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold text-muted-foreground uppercase">Access Points</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-4xl font-headline font-black text-primary">KIT</p>
                <p className="text-xs text-accent font-bold mt-1">Authenticator + Biometrics</p>
              </CardContent>
            </Card>

            <Card className="border-none shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold text-muted-foreground uppercase">Encryption Standard</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end justify-between">
                  <p className="text-4xl font-headline font-black text-primary">AES</p>
                  <div className="h-1.5 w-24 bg-muted rounded-full overflow-hidden mb-2">
                    <div className="h-full bg-accent w-[100%]" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle className="text-primary">My Documents</CardTitle>
              <p className="text-sm text-muted-foreground">Files your admin has shared with your KIT ID.</p>
            </CardHeader>
            <CardContent>
              {!session && (
                <div className="p-6 text-center text-sm text-muted-foreground border border-dashed rounded-lg">
                  Please sign in with your KIT ID to see your documents.
                </div>
              )}
              {session && documents.length === 0 && (
                <div className="p-6 text-center text-sm text-muted-foreground border border-dashed rounded-lg">
                  No documents yet — please check back once your admin uploads one.
                </div>
              )}
              {session && documents.length > 0 && (
                <div className="divide-y">
                  {documents.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between py-3">
                      <div className="flex items-center gap-3">
                        <div className="bg-primary/10 p-2 rounded-lg">
                          <FileText className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-primary">{doc.fileName}</p>
                          <p className="text-xs text-muted-foreground">
                            Added {new Date(doc.uploadedAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <a href={doc.dataUrl} download={doc.fileName}>
                        <Button variant="outline" size="sm" className="gap-2 border-primary/20 text-primary hover:bg-primary/5">
                          <Download className="h-4 w-4" /> Download
                        </Button>
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-none shadow-sm">
              <CardHeader>
                <CardTitle className="text-primary">Recent Security Logs</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { title: 'Secure Login', note: 'Session initiated via KIT ID', time: '2h ago' },
                  { title: 'Vault Access', note: 'Encrypted block accessed', time: '5h ago' },
                  { title: 'MFA Heartbeat', note: 'Biometric verification successful', time: '1d ago' },
                ].map((item, idx) => (
                  <div key={idx} className="flex items-start justify-between p-3 hover:bg-muted/30 rounded-lg transition-colors cursor-pointer group">
                    <div>
                      <h4 className="font-bold text-sm text-primary">{item.title}</h4>
                      <p className="text-sm text-muted-foreground">{item.note}</p>
                    </div>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase group-hover:text-accent">{item.time}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-none shadow-sm">
              <CardHeader>
                <CardTitle className="text-primary">Vault Protection</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-lg border border-primary/10">
                  <div className="bg-primary/20 p-2 rounded-lg">
                    <Smartphone className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-primary">KIT MFA Link</p>
                    <p className="text-xs text-muted-foreground">Active Protection System</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
