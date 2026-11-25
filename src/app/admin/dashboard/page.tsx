'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, Users, Loader2, AlertCircle, FileText, IdCard, Pencil, LayoutGrid } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  adminLogout,
  listAdmins,
  listMembers,
  updateAdminProfile,
  type AdminSummary,
  type MemberSummary,
  type ProvisionedMember,
} from '@/lib/admin-api';
import { ApiError } from '@/lib/api';
import { getAdminDisplayCache, setAdminDisplayCache, clearAdminDisplayCache } from '@/lib/admin-session-cache';
import { SiteHeader } from '@/components/site/SiteShell';
import { useT } from '@/lib/i18n';
import { AdminsSection, type CreatedInvite } from '@/components/admin/AdminsSection';
import { BarcodeGenerator } from '@/components/admin/BarcodeGenerator';
import { KitIdListTab } from '@/components/admin/KitIdListTab';
import { ProvisionTab } from '@/components/admin/ProvisionTab';
import { UploadDocumentsTab, type LastIngest } from '@/components/admin/UploadDocumentsTab';

export default function AdminDashboardPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { t, locale } = useT();
  const [admin, setAdmin] = useState<{ email: string; name: string } | null>(null);
  const [checked, setChecked] = useState(false);
  const [admins, setAdmins] = useState<AdminSummary[]>([]);
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [adminsFailed, setAdminsFailed] = useState(false);
  const [membersFailed, setMembersFailed] = useState(false);

  const [section, setSection] = useState<'overview' | 'admins' | 'kit'>('overview');
  const [kitTab, setKitTab] = useState<'list' | 'provision' | 'barcodes' | 'upload'>('list');

  // Results the backend can only ever give us once. They live here because the
  // sections below unmount when you switch away, and these must not disappear.
  const [provisioned, setProvisioned] = useState<ProvisionedMember[]>([]);
  const [lastInvite, setLastInvite] = useState<CreatedInvite | null>(null);
  // The backend has no "list past uploads" endpoint, so this only covers this session.
  const [lastIngest, setLastIngest] = useState<LastIngest | null>(null);

  // --- Self-service name update (POST /api/admin/profile, any role) ---
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);

  const loadAdmins = async () => {
    try {
      setAdmins(await listAdmins());
      setAdminsFailed(false);
    } catch {
      setAdminsFailed(true);
    }
  };

  const loadMembers = async () => {
    try {
      setMembers(await listMembers());
      setMembersFailed(false);
    } catch {
      setMembersFailed(true);
    }
  };

  useEffect(() => {
    // The display cache only says who to show. The first API calls below are
    // what check the real session: a 401 redirects to login (see adminFetch).
    const session = getAdminDisplayCache();
    if (!session) {
      router.push('/admin/login');
      return;
    }
    setAdmin(session);
    Promise.all([loadAdmins(), loadMembers()]).then(() => setChecked(true));
  }, [router]);

  const handleLogout = async () => {
    toast({ variant: 'success', title: 'Signed out', description: 'Please log back in whenever you need admin access.' });
    try {
      await adminLogout(); // clears the real session cookie server-side
    } catch {
      // even if this network call fails, still clear local state and send them to login
    }
    clearAdminDisplayCache();
    setTimeout(() => router.push('/admin/login'), 500);
  };

  const handleSaveName = async () => {
    if (!nameInput.trim()) return;
    setSavingName(true);
    try {
      const session = await updateAdminProfile(nameInput.trim());
      setAdmin(session);
      setAdminDisplayCache(session);
      setEditingName(false);
      toast({ variant: 'success', title: 'Name updated', description: 'Your display name has been updated.' });
      loadAdmins(); // refresh so the admin list reflects the new name too
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Please try again — we couldn't update your name.";
      toast({ variant: 'destructive', title: 'Could not update name', description: message });
    } finally {
      setSavingName(false);
    }
  };

  const handleProvisioned = (created: ProvisionedMember[]) => {
    // Added to, not replaced: generating another batch must not wipe keys from
    // the previous one that haven't been copied yet.
    setProvisioned((prev) => [...created, ...prev]);
    loadMembers(); // refresh so the new ones show up everywhere else on this page
  };

  // Derived from our own entry in the admins list (backend now only sends
  // us everyone's data if we ARE a superadmin — this just mirrors that for the UI).
  const isSuperadmin = admins.find((a) => a.email === admin?.email)?.role === 'superadmin';

  if (!checked) {
    return <div className="min-h-screen bg-background" />;
  }

  // LAYOUT (vishva-charts): same header/footer as the rest of the site, with
  // the sections as tabs under the header instead of a sidebar.
  const navItemClass = (active: boolean) =>
    `inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
      active ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
    }`;

  const sideItemClass = (active: boolean) =>
    `flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
      active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
    }`;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SiteHeader
        fullWidth
        logoHref="/admin/dashboard"
        right={
          <>
            <span className="hidden sm:inline rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
              {isSuperadmin ? t('Super admin') : t('Admin')}
            </span>
            <span className="hidden md:inline text-sm text-muted-foreground">{admin?.email}</span>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" /> {t('Sign out')}
            </Button>
          </>
        }
      />
      {/* Phones: sections as tabs under the header */}
      <div className="border-b bg-card lg:hidden">
        <nav className="flex w-full gap-6 overflow-x-auto px-4 sm:px-6">
          <button type="button" className={navItemClass(section === 'overview')} onClick={() => setSection('overview')}>
            <LayoutGrid className="h-4 w-4" /> {t('Overview')}
          </button>
          <button type="button" className={navItemClass(section === 'admins')} onClick={() => setSection('admins')}>
            <Users className="h-4 w-4" /> {t('Admins')}
          </button>
          <button type="button" className={navItemClass(section === 'kit')} onClick={() => setSection('kit')}>
            <IdCard className="h-4 w-4" /> {t('KIT IDs')}
          </button>
        </nav>
      </div>

      <div className="flex-1 min-w-0 flex">
        {/* Laptops: light sidebar, same look as the rest of the site */}
        <aside className="hidden lg:flex w-60 shrink-0 flex-col border-r bg-card px-3 py-6">
          <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('Manage')}</p>
          <nav className="flex flex-col gap-1">
            <button type="button" className={sideItemClass(section === 'overview')} onClick={() => setSection('overview')}>
              <LayoutGrid className="h-4 w-4" /> {t('Overview')}
            </button>
            <button type="button" className={sideItemClass(section === 'admins')} onClick={() => setSection('admins')}>
              <Users className="h-4 w-4" /> {t('Admins')}
            </button>
            <button type="button" className={sideItemClass(section === 'kit')} onClick={() => setSection('kit')}>
              <IdCard className="h-4 w-4" /> {t('KIT IDs')}
            </button>
          </nav>
        </aside>
        <main id="main" className="flex-1 min-w-0 px-4 sm:px-8 py-8 max-w-5xl space-y-6">
          {(adminsFailed || membersFailed) && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {t("We couldn't load all the data on this page, so what's shown may be incomplete. Please refresh to try again.")}
              </AlertDescription>
            </Alert>
          )}

          {section === 'overview' && (
            <>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-semibold tracking-tight">{t('Welcome, {name}', { name: admin?.name || admin?.email || '' })}</h1>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={t('Edit your name')}
                    onClick={() => { setEditingName(true); setNameInput(admin?.name || ''); }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground mt-1">{t('Manage admins, KIT IDs and uploads.')}</p>
                {editingName && (
                  <div className="flex items-center gap-2 mt-2">
                    <Input className="w-56 h-9" value={nameInput} onChange={(e) => setNameInput(e.target.value)} />
                    <Button size="sm" onClick={handleSaveName} disabled={savingName}>
                      {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : t('Save')}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingName(false)}>{t('Cancel')}</Button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">{t('Admins')}</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-semibold tracking-tight">{adminsFailed ? '—' : admins.length}</div>
                    <CardDescription>{t('With portal access')}</CardDescription>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">{t('KIT IDs')}</CardTitle>
                    <IdCard className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-semibold tracking-tight">{membersFailed ? '—' : members.length}</div>
                    <CardDescription>{membersFailed ? t('Not available') : t('{n} registered', { n: members.filter((m) => m.registered).length.toLocaleString(locale) })}</CardDescription>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">{t('Last upload')}</CardTitle>
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-semibold tracking-tight">{lastIngest ? lastIngest.rowCount : '—'}</div>
                    <CardDescription>{lastIngest ? t('row(s) for {kitId}', { kitId: lastIngest.kitId }) : t('No uploads yet this session')}</CardDescription>
                  </CardContent>
                </Card>
              </div>
            </>
          )}

          {section === 'admins' && (
            <AdminsSection
              admins={admins}
              isSuperadmin={isSuperadmin}
              lastInvite={lastInvite}
              onInviteCreated={setLastInvite}
            />
          )}

          {section === 'kit' && (
            <Tabs value={kitTab} onValueChange={(v) => setKitTab(v as typeof kitTab)}>
              <TabsList className="h-auto flex-wrap justify-start">
                <TabsTrigger value="list">{t('List')}</TabsTrigger>
                <TabsTrigger value="provision">{t('Provision')}</TabsTrigger>
                <TabsTrigger value="barcodes">{t('Barcodes')}</TabsTrigger>
                <TabsTrigger value="upload">{t('Upload documents')}</TabsTrigger>
              </TabsList>

              <TabsContent value="list" className="space-y-4">
                <KitIdListTab members={members} loadFailed={membersFailed} isSuperadmin={isSuperadmin} />
              </TabsContent>

              <TabsContent value="provision" className="space-y-4">
                <ProvisionTab provisioned={provisioned} onProvisioned={handleProvisioned} />
              </TabsContent>

              <TabsContent value="barcodes" className="space-y-4">
                <BarcodeGenerator members={members.filter((m) => !m.registered)} />
              </TabsContent>

              <TabsContent value="upload" className="space-y-4">
                <UploadDocumentsTab members={members} lastIngest={lastIngest} onIngested={setLastIngest} />
              </TabsContent>
            </Tabs>
          )}
        </main>
      </div>
      
    </div>
  );
}
