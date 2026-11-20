'use client';

import { useState } from 'react';
import { AlertCircle, Copy, Download, Loader2, Plus } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { provisionMembers, splitProvisionedKeys, type ProvisionedMember } from '@/lib/admin-api';
import { ApiError } from '@/lib/api';
import { ListPager, usePagedList } from '@/components/admin/ListPager';
import { useT } from '@/lib/i18n';

// Each KIT ID costs the server about half a second of password hashing. If a
// batch outlasts the server's 30s timeout, the KIT IDs are saved but their
// one-time keys never reach this page and are lost for good.
const MAX_BATCH_SIZE = 25;

interface ProvisionTabProps {
  // Owned by the page: these keys can't be fetched again, so they have to survive leaving this tab.
  provisioned: ProvisionedMember[];
  onProvisioned: (members: ProvisionedMember[]) => void;
}

export function ProvisionTab({ provisioned, onProvisioned }: ProvisionTabProps) {
  const { toast } = useToast();
  const { t } = useT();
  const [count, setCount] = useState(1);
  const [provisioning, setProvisioning] = useState(false);
  const [error, setError] = useState('');
  const pagedProvisioned = usePagedList(provisioned, provisioned);

  const handleProvision = async () => {
    if (!Number.isInteger(count) || count < 1 || count > MAX_BATCH_SIZE) {
      setError(t('Please enter a whole number from 1 to {max}. For more, generate another batch afterwards.', { max: MAX_BATCH_SIZE }));
      return;
    }
    setProvisioning(true);
    setError('');
    try {
      const result = await provisionMembers(count);
      onProvisioned(result.members);
      toast({ variant: 'success', title: 'KIT IDs generated', description: t('{n} new KIT ID(s) created.', { n: result.members.length }) });
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Please try again — we couldn't generate new KIT IDs.";
      setError(message);
    } finally {
      setProvisioning(false);
    }
  };

  const handleCopy = (member: ProvisionedMember) => {
    const { signupKey, recoveryKeys } = splitProvisionedKeys(member);
    const text = `KIT ID: ${member.kitId}\nSignup key: ${signupKey}\nRecovery keys:\n${recoveryKeys.join('\n')}`;
    navigator.clipboard?.writeText(text);
    toast({ variant: 'success', title: 'Copied', description: t("Please paste this somewhere safe — {kitId}'s keys won't be shown again.", { kitId: member.kitId }) });
  };

  // The hand-off file for the lab to print and distribute KIT IDs to clients.
  // One row per KIT ID, recovery keys semicolon-joined in one column.
  const handleDownload = () => {
    if (provisioned.length === 0) return;
    const header = 'KIT ID,Signup Key,Recovery Keys\n';
    const rows = provisioned
      .map((m) => {
        const { signupKey, recoveryKeys } = splitProvisionedKeys(m);
        return `${m.kitId},${signupKey},"${recoveryKeys.join('; ')}"`;
      })
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kit-ids-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Provision new KIT IDs')}</CardTitle>
        <CardDescription>
          {t('Generate brand-new KIT IDs, up to {max} at a time. Each one gets a setup code, which the member enters when they set up their account, and recovery keys for a lost device. Keys are shown only here and are gone once you reload or leave this page, so copy or download them first.', { max: MAX_BATCH_SIZE })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{t(error)}</AlertDescription>
          </Alert>
        )}
        <div className="flex items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="provision-count">{t('How many?')}</Label>
            <Input
              id="provision-count"
              type="number"
              min={1}
              max={MAX_BATCH_SIZE}
              className="w-28"
              value={count}
              onChange={(e) => setCount(parseInt(e.target.value, 10) || 0)}
            />
          </div>
          <Button onClick={handleProvision} disabled={provisioning} className="h-10">
            {provisioning ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-2" /> {t('Generate')}</>}
          </Button>
        </div>

        {provisioned.length > 0 && (
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" /> {t('Download CSV')}
              </Button>
            </div>
            <div className="border rounded-lg divide-y">
              {pagedProvisioned.visible.map((m) => {
                const { signupKey, recoveryKeys } = splitProvisionedKeys(m);
                return (
                  <div key={m.kitId} className="px-4 py-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-sm">{m.kitId}</p>
                      <Button variant="ghost" size="sm" onClick={() => handleCopy(m)}>
                        <Copy className="h-4 w-4 mr-2" /> {t('Copy')}
                      </Button>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground w-24">{t('Setup code')}</span>
                        <code className="text-xs bg-accent/10 px-2 py-1 rounded">{signupKey}</code>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground w-24">{t('Recovery keys')}</span>
                        {recoveryKeys.map((key) => (
                          <code key={key} className="text-xs bg-muted px-2 py-1 rounded">{key}</code>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <ListPager {...pagedProvisioned.pager} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
