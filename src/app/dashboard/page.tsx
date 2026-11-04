'use client';

// The session lives in an HttpOnly cookie the browser already holds after
// login/registration — we just ask the server who it belongs to
// (GET /api/session/me). If that call fails (no cookie, expired, etc.) we
// bounce to /login, same pattern as the admin dashboard's session guard.
//
// Members have "records" on the backend — rows from a CSV an admin ingested
// for their KIT ID. There's no file to download; each record is opened to see
// its column/value pairs instead.

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Shield,
  BookOpen,
  LogOut,
  FileText,
  Eye,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getMemberSession, getRecords, getRecord, groupRecordsByUpload, memberLogout, type SessionResponse, type RecordSummary, type RecordDetail } from '@/lib/member-api';
import { ApiError } from '@/lib/api';

export default function DashboardPage() {
  const { toast } = useToast();
  const router = useRouter();
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [checked, setChecked] = useState(false); // distinguishes "still checking" from "confirmed signed out", so we don't flash a message before the real session check finishes
  const [records, setRecords] = useState<RecordSummary[]>([]);
  const [recordsFailed, setRecordsFailed] = useState(false);
  const [viewingRecord, setViewingRecord] = useState<RecordDetail | null>(null);
  const [loadingRecord, setLoadingRecord] = useState(false);

  useEffect(() => {
    let cancelled = false;

    getMemberSession()
      .then(async (s) => {
        if (cancelled) return;
        setSession(s);
        try {
          const res = await getRecords();
          if (!cancelled) setRecords(res.records ?? []);
        } catch (e) {
          if (e instanceof ApiError && e.status === 401) throw e;
          // Signed in, but the records didn't load. Say so, rather than showing "no records".
          if (!cancelled) setRecordsFailed(true);
        }
        if (!cancelled) setChecked(true);
      })
      .catch(() => {
        // No valid session cookie (not logged in, or it expired) — bounce to login.
        if (!cancelled) router.push('/login');
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleViewRecord = async (id: number) => {
    setLoadingRecord(true);
    try {
      const detail = await getRecord(id);
      setViewingRecord(detail);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        router.push('/login');
        return;
      }
      toast({ variant: 'destructive', title: 'Could Not Load Record', description: "Please try again — we couldn't open that record." });
    } finally {
      setLoadingRecord(false);
    }
  };

  const handleLogout = async () => {
    toast({
      title: "Securing Your Session",
      description: "Please wait a moment while we log you out.",
    });
    try {
      await memberLogout(); // clears the session cookie server-side, not just a navigation
    } catch {
      // Proceed to /login regardless — even if this call fails, redirecting
      // ends the session for this tab either way.
    }
    router.push('/login?logout=success');
  };

  const uploads = groupRecordsByUpload(records);

  return (
    <div className="min-h-screen flex bg-[#F4F6F9]">
      <aside className="w-64 bg-primary text-white hidden lg:flex flex-col p-6">
        <div className="flex items-center gap-2 mb-10">
          <Shield className="h-8 w-8 text-accent" />
          <span className="font-headline font-bold text-xl uppercase tracking-tighter">Data Vault</span>
        </div>

        <nav className="flex-1 space-y-2">
          <div className="flex items-center gap-3 px-4 py-3 bg-white/10 rounded-xl font-medium">
            <BookOpen className="h-5 w-5" /> My Records
          </div>
        </nav>

        <Button
          variant="ghost"
          onClick={handleLogout}
          className="text-white hover:bg-white/10 justify-start px-4"
        >
          <LogOut className="mr-3 h-5 w-5" /> Secure Logout
        </Button>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b px-8 flex items-center justify-end shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                {/* Members have no name field (pseudonymous by design) — show a generic label + KIT ID */}
                <p className="text-sm font-bold text-primary">Member</p>
                <p className="text-xs text-muted-foreground uppercase">{session?.kitId || 'KIT ID SECURED'}</p>
              </div>
              <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold">
                DV
              </div>
            </div>
            {/* The sidebar with its logout button is hidden on small screens */}
            <Button variant="outline" size="sm" onClick={handleLogout} className="lg:hidden">
              <LogOut className="mr-2 h-4 w-4" /> Log Out
            </Button>
          </div>
        </header>

        <div className="p-8 space-y-8">
          <h1 className="text-3xl font-headline font-bold text-primary">My Records</h1>

          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle className="text-primary">Your Uploads</CardTitle>
              <p className="text-sm text-muted-foreground">Records your admin has added for your KIT ID.</p>
            </CardHeader>
            <CardContent>
              {!checked && (
                <div className="p-6 text-center text-sm text-muted-foreground border border-dashed rounded-lg">
                  Checking your session…
                </div>
              )}
              {checked && recordsFailed && (
                <div className="p-6 text-center text-sm text-destructive border border-dashed rounded-lg">
                  We couldn&apos;t load your records. Please refresh the page to try again.
                </div>
              )}
              {checked && !recordsFailed && records.length === 0 && (
                <div className="p-6 text-center text-sm text-muted-foreground border border-dashed rounded-lg">
                  No records yet — please check back once your admin uploads one.
                </div>
              )}
              {checked && uploads.length > 0 && (
                <div className="space-y-6">
                  {uploads.map((upload) => (
                    <section key={upload.batchId}>
                      <h3 className="text-xs font-bold text-muted-foreground uppercase">
                        Uploaded {new Date(upload.createdAt).toLocaleString()}
                      </h3>
                      <div className="divide-y">
                        {upload.records.map((r) => (
                          <div key={r.id} className="flex items-center justify-between py-3">
                            <div className="flex items-center gap-3">
                              <div className="bg-primary/10 p-2 rounded-lg">
                                <FileText className="h-4 w-4 text-primary" />
                              </div>
                              <p className="text-sm font-bold text-primary">Record #{r.rowIndex + 1}</p>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-2 border-primary/20 text-primary hover:bg-primary/5"
                              onClick={() => handleViewRecord(r.id)}
                            >
                              <Eye className="h-4 w-4" /> View
                            </Button>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Record detail dialog — records have no downloadable file, just column/value fields. */}
      <Dialog open={!!viewingRecord || loadingRecord} onOpenChange={(open) => { if (!open) setViewingRecord(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Details</DialogTitle>
            <DialogDescription>
              {viewingRecord ? `Added ${new Date(viewingRecord.createdAt).toLocaleDateString()}` : 'Loading…'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {loadingRecord && !viewingRecord && <p className="text-sm text-muted-foreground">Loading…</p>}
            {/* Index in the key because a CSV can repeat a column name */}
            {viewingRecord?.fields.map((f, i) => (
              <div key={`${i}-${f.column}`} className="flex justify-between gap-4 text-sm border-b pb-1">
                <span className="font-bold text-primary">{f.column}</span>
                <span className="text-right break-all">{f.value}</span>
              </div>
            ))}
            {viewingRecord && viewingRecord.fields.length === 0 && (
              <p className="text-sm text-muted-foreground">This record has no fields.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
