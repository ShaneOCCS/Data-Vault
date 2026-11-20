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
import { HealthSummary } from '@/components/health/HealthSummary';
import { SiteHeader, SiteFooter } from '@/components/site/SiteShell';
import { useT } from '@/lib/i18n';

export default function DashboardPage() {
  const { toast } = useToast();
  const { t, locale } = useT();
  const router = useRouter();
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [checked, setChecked] = useState(false); // distinguishes "still checking" from "confirmed signed out", so we don't flash a message before the real session check finishes
  const [records, setRecords] = useState<RecordSummary[]>([]);
  const [recordsFailed, setRecordsFailed] = useState(false);
  const [viewingRecord, setViewingRecord] = useState<RecordDetail | null>(null);
  const [loadingRecord, setLoadingRecord] = useState(false);
  // Full contents of every record, for the health summary charts and export.
  const [details, setDetails] = useState<RecordDetail[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    getMemberSession()
      .then(async (s) => {
        if (cancelled) return;
        setSession(s);
        try {
          const res = await getRecords();
          const list = res.records ?? [];
          if (!cancelled) setRecords(list);
          // Open every record (capped) so the summary can chart them. Each open
          // is logged server-side like a normal "View", which is fine here.
          const opened = await Promise.all(list.slice(0, 100).map((r) => getRecord(r.id).catch(() => null)));
          if (!cancelled) setDetails(opened.filter((d): d is RecordDetail => d !== null));
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
      toast({ variant: 'destructive', title: 'Could not load record', description: "Please try again — we couldn't open that record." });
    } finally {
      setLoadingRecord(false);
    }
  };

  const handleLogout = async () => {
    toast({
      title: 'Securing your session',
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
    <div className="min-h-screen flex flex-col bg-background">
      {/* LAYOUT (vishva-charts): same header/footer as the rest of the site */}
      <SiteHeader
        logoHref="/dashboard"
        right={
          <>
            <span className="hidden sm:inline font-mono text-sm text-muted-foreground">{session?.kitId}</span>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" /> {t('Sign out')}
            </Button>
          </>
        }
      />

      <main id="main" className="flex-1 flex flex-col min-w-0">
        <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t('Your records')}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {session ? <>{t('Everything shared with KIT ID')} <span className="font-mono font-semibold text-foreground">{session.kitId}</span>.</> : t('Checking your session…')}
            </p>
          </div>

          {checked && session && details && details.length > 0 && (
            <HealthSummary kitId={session.kitId} records={details} />
          )}

          <Card>
            <CardHeader>
              <CardTitle>{t('Your uploads')}</CardTitle>
              <p className="text-sm text-muted-foreground">{t('Records your admin has added for your KIT ID.')}</p>
            </CardHeader>
            <CardContent>
              {!checked && (
                <div className="p-6 text-center text-sm text-muted-foreground border border-dashed rounded-lg">
                  {t('Checking your session…')}
                </div>
              )}
              {checked && recordsFailed && (
                <div className="p-6 text-center text-sm text-destructive border border-dashed rounded-lg">
                  {t("We couldn't load your records. Please refresh the page to try again.")}
                </div>
              )}
              {checked && !recordsFailed && records.length === 0 && (
                <div className="p-6 text-center text-sm text-muted-foreground border border-dashed rounded-lg">
                  {t('No records yet — please check back once your admin uploads one.')}
                </div>
              )}
              {checked && uploads.length > 0 && (
                <div className="space-y-6">
                  {uploads.map((upload) => (
                    <section key={upload.batchId}>
                      <h3 className="text-xs font-bold text-muted-foreground uppercase">
                        {t('Uploaded {date}', { date: new Date(upload.createdAt).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }) })}
                      </h3>
                      <div className="divide-y">
                        {upload.records.map((r) => (
                          <div key={r.id} className="flex items-center justify-between py-3">
                            <div className="flex items-center gap-3">
                              <div className="bg-primary/10 p-2 rounded-lg">
                                <FileText className="h-4 w-4 text-primary" />
                              </div>
                              <p className="text-sm font-bold text-primary">{t('Record #{n}', { n: r.rowIndex + 1 })}</p>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-2 border-primary/20 text-primary hover:bg-primary/5"
                              onClick={() => handleViewRecord(r.id)}
                            >
                              <Eye className="h-4 w-4" /> {t('View')}
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
      <SiteFooter showStaffLink={false} />

      {/* Record detail dialog — records have no downloadable file, just column/value fields. */}
      <Dialog open={!!viewingRecord || loadingRecord} onOpenChange={(open) => { if (!open) setViewingRecord(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Record details')}</DialogTitle>
            <DialogDescription>
              {viewingRecord ? t('Added {date}', { date: new Date(viewingRecord.createdAt).toLocaleDateString(locale) }) : t('Loading…')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {loadingRecord && !viewingRecord && <p className="text-sm text-muted-foreground">{t('Loading…')}</p>}
            {/* Index in the key because a CSV can repeat a column name */}
            {viewingRecord?.fields.map((f, i) => (
              <div key={`${i}-${f.column}`} className="flex justify-between gap-4 text-sm border-b pb-1">
                <span className="font-bold text-primary">{f.column}</span>
                <span className="text-right break-all">{f.value}</span>
              </div>
            ))}
            {viewingRecord && viewingRecord.fields.length === 0 && (
              <p className="text-sm text-muted-foreground">{t('This record has no fields.')}</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
