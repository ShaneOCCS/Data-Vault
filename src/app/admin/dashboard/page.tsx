'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, LogOut, Users, Trash2, UserPlus, Loader2, AlertCircle, Upload, FileText, IdCard, Search, ScanLine, X } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  getAdminSession,
  clearAdminSession,
  getAllAdmins,
  addAdmin,
  removeAdmin,
  type Admin,
} from '@/app/lib/admin-store';
import { getAllAccounts, setAccountActive, isAccountActive, type Account } from '@/app/lib/local-db';
import {
  uploadDocument,
  getAllDocuments,
  deleteDocument,
  type VaultDocument,
} from '@/app/lib/document-store';
import { BarcodeScannerDialog } from '@/components/admin/BarcodeScannerDialog';
import { BarcodeGenerator } from '@/components/admin/BarcodeGenerator';

export default function AdminDashboardPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [admin, setAdmin] = useState<{ email: string; name: string } | null>(null);
  const [checked, setChecked] = useState(false);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [addError, setAddError] = useState('');
  const [adding, setAdding] = useState(false);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [documents, setDocuments] = useState<VaultDocument[]>([]);
  const [selectedKitId, setSelectedKitId] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [kitSearch, setKitSearch] = useState('');
  const [uploadKitSearch, setUploadKitSearch] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [togglingKitId, setTogglingKitId] = useState<string | null>(null);

  const loadAdmins = async () => {
    const list = await getAllAdmins();
    setAdmins(list);
  };

  const loadAccounts = async () => {
    const list = await getAllAccounts();
    setAccounts(list);
  };

  const loadDocuments = async () => {
    const list = await getAllDocuments();
    setDocuments(list);
  };

  useEffect(() => {
    const session = getAdminSession();
    if (!session) {
      router.push('/admin/login');
      return;
    }
    setAdmin(session);
    setChecked(true);
    loadAdmins();
    loadAccounts();
    loadDocuments();
  }, [router]);

  const handleLogout = () => {
    toast({ variant: 'success', title: 'Signed Out', description: 'Please log back in whenever you need admin access.' });
    clearAdminSession();
    setTimeout(() => router.push('/admin/login'), 500);
  };

  const handleAddAdmin = async () => {
    if (!newName || !newEmail || !newPassword) {
      setAddError('Please fill in the name, email, and password to continue.');
      return;
    }
    setAdding(true);
    setAddError('');
    const result = await addAdmin({ name: newName, email: newEmail, password: newPassword });
    setAdding(false);
    if (!result.ok) {
      setAddError(result.error || "Please try again — we couldn't add this admin.");
      return;
    }
    toast({ variant: 'success', title: 'Admin Added', description: `Please share the new login with ${newEmail} — they can sign in now.` });
    setNewName('');
    setNewEmail('');
    setNewPassword('');
    loadAdmins();
  };

  const handleRemoveAdmin = async (email: string) => {
    await removeAdmin(email);
    toast({ variant: 'success', title: 'Admin Removed', description: `Please note — ${email} no longer has access.` });
    loadAdmins();
  };

  const handleUploadClick = () => {
    if (!selectedKitId) {
      setUploadError('Please select a KIT ID before uploading a file.');
      return;
    }
    setUploadError('');
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedKitId) return;
    setUploading(true);
    setUploadError('');
    const result = await uploadDocument(selectedKitId, file);
    setUploading(false);
    if (!result.ok) {
      setUploadError(result.error || "Please try again — we couldn't upload that file.");
      return;
    }
    toast({ variant: 'success', title: 'Document Uploaded', description: `Please note — ${selectedKitId} can now access "${file.name}".` });
    loadDocuments();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDeleteDocument = async (id: string, fileName: string) => {
    await deleteDocument(id);
    toast({ variant: 'success', title: 'Document Removed', description: `Please note — "${fileName}" is no longer available for download.` });
    loadDocuments();
  };

  const handleToggleActive = async (acc: Account) => {
    const nextActive = !isAccountActive(acc);
    setTogglingKitId(acc.kitId);
    try {
      await setAccountActive(acc.kitId, nextActive);
      toast({
        variant: 'success',
        title: nextActive ? 'KIT ID Activated' : 'KIT ID Deactivated',
        description: nextActive
          ? `Please note — ${acc.kitId} can log in again.`
          : `Please note — ${acc.kitId} can no longer log in. Admins can still upload files for it.`,
      });
      loadAccounts();
    } finally {
      setTogglingKitId(null);
    }
  };

  const handleBarcodeScan = (value: string) => {
    const normalized = value.trim().toUpperCase();
    const match = accounts.find((a) => a.kitId.toUpperCase() === normalized);
    if (match) {
      setSelectedKitId(match.kitId);
      setUploadKitSearch('');
      toast({ variant: 'success', title: 'KIT ID Scanned', description: `Selected ${match.kitId} — ${match.name}.` });
    } else {
      setUploadKitSearch(normalized);
      toast({ variant: 'destructive', title: 'No Match Found', description: `"${normalized}" doesn't match any known KIT ID. Please check and try again.` });
    }
  };

  const filteredAccounts = accounts.filter((acc) => {
    const q = kitSearch.trim().toLowerCase();
    if (!q) return true;
    return acc.kitId.toLowerCase().includes(q);
  });

  const uploadFilteredAccounts = accounts.filter((acc) => {
    const q = uploadKitSearch.trim().toLowerCase();
    if (!q) return true;
    return acc.kitId.toLowerCase().includes(q);
  });

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (!checked) {
    return <div className="flex items-center justify-center h-screen text-muted-foreground">Checking access...</div>;
  }

  return (
    <div className="min-h-screen bg-[#F4F6F9]">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="bg-primary p-1.5 rounded-lg"><Shield className="h-5 w-5 text-white" /></div>
          <span className="font-bold text-lg text-primary tracking-tighter uppercase">Data Vault Admin</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">{admin?.email}</span>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" /> Sign Out
          </Button>
        </div>
      </header>

      <main className="p-6 max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Welcome, {admin?.name}</h1>
          <p className="text-muted-foreground">Manage admin access, KIT IDs, and shared documents below.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Admins</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{admins.length}</div>
              <CardDescription>With portal access</CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">KIT IDs</CardTitle>
              <IdCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{accounts.length}</div>
              <CardDescription>{accounts.filter((a) => a.registered).length} registered</CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Documents</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{documents.length}</div>
              <CardDescription>Shared with KIT IDs</CardDescription>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Manage Admins</CardTitle>
            <CardDescription>Add or remove admin logins.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {addError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{addError}</AlertDescription>
              </Alert>
            )}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
              <div className="space-y-1.5">
                <Label htmlFor="new-name">Name</Label>
                <Input id="new-name" placeholder="Jane Doe" value={newName} onChange={(e) => setNewName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-email">Email</Label>
                <Input id="new-email" type="email" placeholder="jane@gmail.com" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-password">Password</Label>
                <Input id="new-password" type="password" placeholder="••••••••" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              </div>
              <Button onClick={handleAddAdmin} disabled={adding} className="h-10">
                {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <><UserPlus className="h-4 w-4 mr-2" /> Add Admin</>}
              </Button>
            </div>

            <div className="border rounded-lg divide-y">
              {admins.length === 0 && (
                <div className="p-6 text-center text-sm text-muted-foreground">No admins yet.</div>
              )}
              {admins.map((a) => (
                <div key={a.email} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="font-medium text-sm">{a.name}</p>
                    <p className="text-xs text-muted-foreground">{a.email}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleRemoveAdmin(a.email)}
                    disabled={admins.length === 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Registered KIT IDs</CardTitle>
            <CardDescription>Please review everyone who has a vault account, and activate or deactivate their login access.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by KIT ID..."
                value={kitSearch}
                onChange={(e) => setKitSearch(e.target.value)}
                className="pl-9 pr-9"
              />
              {kitSearch && (
                <button
                  type="button"
                  onClick={() => setKitSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="border rounded-lg divide-y">
              {accounts.length === 0 && (
                <div className="p-6 text-center text-sm text-muted-foreground">No KIT IDs yet. Please seed or register one first.</div>
              )}
              {accounts.length > 0 && filteredAccounts.length === 0 && (
                <div className="p-6 text-center text-sm text-muted-foreground">No KIT IDs match "{kitSearch}".</div>
              )}
              {filteredAccounts.map((acc) => {
                const active = isAccountActive(acc);
                return (
                  <div key={acc.kitId} className="flex items-center justify-between px-4 py-3 gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="bg-primary/10 p-2 rounded-lg shrink-0"><IdCard className="h-4 w-4 text-primary" /></div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{acc.name}</p>
                        <p className="text-xs text-muted-foreground">{acc.kitId}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${acc.registered ? 'bg-accent/10 text-accent' : 'bg-muted text-muted-foreground'}`}>
                        {acc.registered ? 'Registered' : 'Pending Setup'}
                      </span>
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {active ? 'Active' : 'Inactive'}
                      </span>
                      <div className="flex items-center gap-2">
                        {togglingKitId === acc.kitId ? (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : (
                          <Switch
                            checked={active}
                            onCheckedChange={() => handleToggleActive(acc)}
                            aria-label={active ? `Deactivate ${acc.kitId}` : `Activate ${acc.kitId}`}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <BarcodeGenerator accounts={accounts} />

        <Card>
          <CardHeader>
            <CardTitle>KIT ID Documents</CardTitle>
            <CardDescription>
              Please upload a PDF or file to a KIT ID — its owner will see it as a download on their personal dashboard.
              Deactivated KIT IDs can still receive uploads; they just can't log in to view them until reactivated.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {uploadError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{uploadError}</AlertDescription>
              </Alert>
            )}
            <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
              <div className="space-y-1.5 flex-1">
                <Label>KIT ID</Label>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by KIT ID..."
                    value={uploadKitSearch}
                    onChange={(e) => setUploadKitSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select value={selectedKitId} onValueChange={setSelectedKitId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a KIT ID" />
                  </SelectTrigger>
                  <SelectContent>
                    {uploadFilteredAccounts.length === 0 && (
                      <div className="px-3 py-2 text-sm text-muted-foreground">No KIT IDs match "{uploadKitSearch}".</div>
                    )}
                    {uploadFilteredAccounts.map((acc) => (
                      <SelectItem key={acc.kitId} value={acc.kitId}>
                        {acc.kitId} — {acc.name}
                        {!isAccountActive(acc) ? ' (Inactive)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" onClick={() => setScannerOpen(true)} className="h-10">
                <ScanLine className="h-4 w-4 mr-2" /> Scan Barcode
              </Button>
              <Button onClick={handleUploadClick} disabled={uploading} className="h-10">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Upload className="h-4 w-4 mr-2" /> Upload File</>}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
            {(() => {
              const selectedAccount = accounts.find((a) => a.kitId === selectedKitId);
              if (!selectedAccount || isAccountActive(selectedAccount)) return null;
              return (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {selectedKitId} is currently deactivated. You can still upload files — the owner will see them once reactivated.
                  </AlertDescription>
                </Alert>
              );
            })()}

            <div className="border rounded-lg divide-y">
              {documents.length === 0 && (
                <div className="p-6 text-center text-sm text-muted-foreground">No documents uploaded yet.</div>
              )}
              {documents.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="bg-muted p-2 rounded-lg"><FileText className="h-4 w-4 text-muted-foreground" /></div>
                    <div>
                      <p className="font-medium text-sm">{doc.fileName}</p>
                      <p className="text-xs text-muted-foreground">{doc.kitId} · {formatSize(doc.size)}</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleDeleteDocument(doc.id, doc.fileName)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </main>

      <BarcodeScannerDialog
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onScan={handleBarcodeScan}
      />
    </div>
  );
}
