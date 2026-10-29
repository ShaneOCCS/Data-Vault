'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, FileText, Download, Smartphone, LifeBuoy } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SiteHeader, SiteFooter } from '@/components/site/SiteShell';
import { getUserSession, clearUserSession } from '@/app/lib/local-db';
import { getDocumentsForKit, type VaultDocument } from '@/app/lib/document-store';
import { getSampleResultsForKit } from '@/app/lib/sample-results';
import { ResultsPlain } from '@/components/results/ResultsPlain';

export default function DashboardPage() {
  const router = useRouter();
  const [session, setSession] = useState<{ kitId: string; name: string } | null>(null);
  const [checked, setChecked] = useState(false);
  const [documents, setDocuments] = useState<VaultDocument[]>([]);

  useEffect(() => {
    const s = getUserSession();
    setSession(s);
    setChecked(true);
    if (s) {
      getDocumentsForKit(s.kitId).then(setDocuments);
    }
  }, []);

  const handleLogout = () => {
    clearUserSession();
    router.push('/login?logout=success');
  };

  if (!checked) {
    return <div className="min-h-screen bg-background" />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SiteHeader
        wide
        logoHref="/dashboard"
        right={
          session ? (
            <>
              <span className="hidden sm:inline font-mono text-sm text-muted-foreground">{session.kitId}</span>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                <LogOut className="h-4 w-4 mr-2" /> Sign out
              </Button>
            </>
          ) : (
            <Button asChild size="sm">
              <Link href="/login">Sign in</Link>
            </Button>
          )
        }
      />

      <main className="flex-1 w-full px-4 sm:px-6 py-8 max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your records</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {session ? (
              <>Files shared with KIT ID <span className="font-mono font-semibold text-foreground">{session.kitId}</span>.</>
            ) : (
              'Sign in with your KIT ID to see your records.'
            )}
          </p>
        </div>

        {session && (() => {
          const { tests } = getSampleResultsForKit(session.kitId);
          if (tests.length === 0) return null;
          return (
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                <div className="space-y-1.5">
                  <CardTitle>Your results</CardTitle>
                  <CardDescription>What your latest test shows, and how it compares with before.</CardDescription>
                </div>
                <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
                  Sample data
                </span>
              </CardHeader>
              <CardContent>
                <ResultsPlain tests={tests} />
              </CardContent>
            </Card>
          );
        })()}

        <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Documents</CardTitle>
              <CardDescription>New results appear here when your clinic uploads them.</CardDescription>
            </CardHeader>
            <CardContent>
              {!session && (
                <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                  <Link href="/login" className="font-medium text-primary hover:underline">Sign in</Link> to see your documents.
                </div>
              )}
              {session && documents.length === 0 && (
                <div className="rounded-xl border border-dashed p-8 text-center">
                  <FileText className="mx-auto h-6 w-6 text-muted-foreground" />
                  <p className="mt-2 text-sm font-medium">No documents yet</p>
                  <p className="text-sm text-muted-foreground">Check back after your clinic uploads your results.</p>
                </div>
              )}
              {session && documents.length > 0 && (
                <ul className="divide-y rounded-xl border">
                  {documents.map((doc) => (
                    <li key={doc.id} className="flex items-center justify-between gap-4 px-4 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="rounded-lg bg-primary/10 p-2">
                          <FileText className="h-4 w-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{doc.fileName}</p>
                          <p className="text-xs text-muted-foreground">
                            Added {new Date(doc.uploadedAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <Button asChild variant="outline" size="sm">
                        <a href={doc.dataUrl} download={doc.fileName}>
                          <Download className="h-4 w-4 mr-2" /> Download
                        </a>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Your account</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex items-start gap-3">
                <Smartphone className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                <div>
                  <p className="font-medium">Authenticator app connected</p>
                  <p className="text-muted-foreground">You sign in with the 6-digit code from your phone.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <LifeBuoy className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                <div>
                  <p className="font-medium">Keep your recovery keys safe</p>
                  <p className="text-muted-foreground">You'll need one if you lose or replace your phone.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      <SiteFooter showStaffLink={false} />
    </div>
  );
}
