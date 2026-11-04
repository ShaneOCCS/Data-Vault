'use client';

import { useState } from 'react';
import { IdCard, KeyRound, Search, X } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { MemberSummary } from '@/lib/admin-api';
import { ListPager, usePagedList } from '@/components/admin/ListPager';
import { TopUpKeysDialog } from '@/components/admin/TopUpKeysDialog';

interface KitIdListTabProps {
  members: MemberSummary[];
  loadFailed: boolean;
  isSuperadmin: boolean;
}

export function KitIdListTab({ members, loadFailed, isSuperadmin }: KitIdListTabProps) {
  const [search, setSearch] = useState('');
  // No "disabled" option on purpose — there's no deactivation concept for KIT
  // IDs in the backend yet (members has no active/disabled flag, unlike admins).
  const [statusFilter, setStatusFilter] = useState<'all' | 'registered' | 'pending'>('all');
  const [topUpTarget, setTopUpTarget] = useState<string | null>(null);

  const filteredMembers = members.filter((m) => {
    const q = search.trim().toLowerCase();
    const matchesQuery = !q || m.kitId.toLowerCase().includes(q);
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'registered' && m.registered) ||
      (statusFilter === 'pending' && !m.registered);
    return matchesQuery && matchesStatus;
  });
  const pagedMembers = usePagedList(filteredMembers, `${statusFilter}|${search}`);

  const filterButton = (value: typeof statusFilter, label: string, count: number) => (
    <Button
      type="button"
      variant={statusFilter === value ? 'default' : 'ghost'}
      size="sm"
      className="h-8"
      onClick={() => setStatusFilter(value)}
    >
      {label} ({count})
    </Button>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>KIT IDs</CardTitle>
        <CardDescription>
          Every KIT ID, registered or still pending setup. Deactivating a KIT ID isn&apos;t available yet.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="inline-flex rounded-lg border p-1 bg-muted/40">
          {filterButton('all', 'All', members.length)}
          {filterButton('registered', 'Registered', members.filter((m) => m.registered).length)}
          {filterButton('pending', 'Pending', members.filter((m) => !m.registered).length)}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by KIT ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-9"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="border rounded-lg divide-y">
          {members.length === 0 && !loadFailed && (
            <div className="p-6 text-center text-sm text-muted-foreground">No KIT IDs yet. Please use the Provision tab to create some.</div>
          )}
          {members.length > 0 && filteredMembers.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">No {statusFilter === 'all' ? '' : `${statusFilter} `}KIT IDs{search.trim() ? ` match "${search}"` : ''}.</div>
          )}
          {pagedMembers.visible.map((m) => (
            <div key={m.kitId} className="flex items-center justify-between px-4 py-3 gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="bg-primary/10 p-2 rounded-lg shrink-0"><IdCard className="h-4 w-4 text-primary" /></div>
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{m.kitId}</p>
                  <p className="text-xs text-muted-foreground">Added {new Date(m.created_at).toLocaleDateString()}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${m.registered ? 'bg-accent/10 text-accent' : 'bg-muted text-muted-foreground'}`}>
                  {m.registered ? 'Registered' : 'Pending Setup'}
                </span>
                {/* Recovery keys let their holder take over an account, so
                    only superadmins get this. The backend doesn't enforce that
                    yet. A Pending Setup member has no enrollment to recover. */}
                {isSuperadmin && m.registered && (
                  <Button variant="outline" size="sm" onClick={() => setTopUpTarget(m.kitId)}>
                    <KeyRound className="h-4 w-4 mr-2" /> Top Up Keys
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
        <ListPager {...pagedMembers.pager} />
      </CardContent>
      {topUpTarget && <TopUpKeysDialog kitId={topUpTarget} onClose={() => setTopUpTarget(null)} />}
    </Card>
  );
}
