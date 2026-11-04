'use client';

import { useState } from 'react';
import { AlertCircle, Copy, Loader2, Mail } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { buildInviteLink, createInvite, type AdminSummary } from '@/lib/admin-api';
import { ApiError } from '@/lib/api';
import { ListPager, usePagedList } from '@/components/admin/ListPager';

export interface CreatedInvite {
  email: string;
  token: string;
  expiresAt: string;
}

interface AdminsSectionProps {
  admins: AdminSummary[];
  isSuperadmin: boolean;
  // Owned by the page: the link can't be fetched again, so it has to survive leaving this section.
  lastInvite: CreatedInvite | null;
  onInviteCreated: (invite: CreatedInvite) => void;
}

export function AdminsSection({ admins, isSuperadmin, lastInvite, onInviteCreated }: AdminsSectionProps) {
  const { toast } = useToast();
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const pagedAdmins = usePagedList(admins);

  const inviteLink = lastInvite ? buildInviteLink(window.location.origin, lastInvite.email, lastInvite.token) : '';

  const handleInvite = async () => {
    if (!inviteEmail.trim()) {
      setInviteError('Please enter an email to invite.');
      return;
    }
    setInviting(true);
    setInviteError('');
    try {
      const result = await createInvite(inviteEmail);
      onInviteCreated(result);
      setInviteEmail('');
      toast({ variant: 'success', title: 'Invite Created', description: `Please share the link below with ${result.email}.` });
    } catch (e) {
      // 403 here means the logged-in admin isn't a superadmin — surface that directly.
      const message = e instanceof ApiError ? e.message : "Please try again — we couldn't create this invite.";
      setInviteError(message);
    } finally {
      setInviting(false);
    }
  };

  const handleCopyInviteLink = () => {
    navigator.clipboard?.writeText(inviteLink);
    toast({ variant: 'success', title: 'Copied', description: 'Invite link copied — share it with the new admin.' });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Manage Admins</CardTitle>
        <CardDescription>
          {isSuperadmin
            ? "Admin accounts with portal access. Removing or disabling an admin isn't available in the app yet."
            : 'Your admin account.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Only superadmins can create invites (backend-enforced too —
            this is just a UI nicety, the real check is server-side). */}
        {isSuperadmin ? (
          <div className="space-y-3">
            {inviteError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{inviteError}</AlertDescription>
              </Alert>
            )}
            <div className="flex items-end gap-3">
              <div className="space-y-1.5 flex-1">
                <Label htmlFor="invite-email">Invite by Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="invite-email"
                    type="email"
                    placeholder="jane@example.com"
                    className="pl-9"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                  />
                </div>
              </div>
              <Button onClick={handleInvite} disabled={inviting} className="h-10">
                {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create Invite'}
              </Button>
            </div>
            {lastInvite && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="space-y-2">
                  <p>Share this link with {lastInvite.email} — it expires {new Date(lastInvite.expiresAt).toLocaleString()}.</p>
                  <div className="flex items-center gap-2">
                    <code className="text-xs bg-muted px-2 py-1 rounded flex-1 truncate">{inviteLink}</code>
                    <Button variant="ghost" size="sm" onClick={handleCopyInviteLink} aria-label="Copy invite link">
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </div>
        ) : (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Only superadmins can invite new admins. Please ask one if you need a new admin added.
            </AlertDescription>
          </Alert>
        )}

        <div className="border rounded-lg divide-y">
          {pagedAdmins.visible.map((a) => (
            <div key={a.email} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="font-medium text-sm">{a.name}</p>
                <p className="text-xs text-muted-foreground">{a.email}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs px-2 py-1 rounded-full font-medium bg-muted text-muted-foreground">
                  {a.role}
                </span>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${a.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {a.active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          ))}
        </div>
        <ListPager {...pagedAdmins.pager} />
      </CardContent>
    </Card>
  );
}
