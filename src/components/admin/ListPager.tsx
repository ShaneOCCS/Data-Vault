'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';

const PAGE_SIZE = 5;

// Shows a list 5 rows at a time. Pass the list's search/filter as resetKey so
// changing it goes back to the first rows.
export function usePagedList<T>(items: T[], resetKey?: unknown) {
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
  }, [resetKey]);

  // The list can shrink while on a later page (e.g. an admin was removed).
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const start = current * PAGE_SIZE;

  return {
    visible: items.slice(start, start + PAGE_SIZE),
    pager: {
      start,
      total: items.length,
      onUp: current > 0 ? () => setPage(current - 1) : undefined,
      onDown: current < pageCount - 1 ? () => setPage(current + 1) : undefined,
    },
  };
}

interface ListPagerProps {
  start: number;
  total: number;
  onUp?: () => void;
  onDown?: () => void;
}

export function ListPager({ start, total, onUp, onDown }: ListPagerProps) {
  if (total <= PAGE_SIZE) return null;

  return (
    <div className="flex items-center justify-end gap-2">
      <span className="text-xs text-muted-foreground">
        {start + 1}–{Math.min(start + PAGE_SIZE, total)} of {total}
      </span>
      <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={onUp} disabled={!onUp} aria-label="Show previous rows">
        <ChevronUp className="h-4 w-4" />
      </Button>
      <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={onDown} disabled={!onDown} aria-label="Show next rows">
        <ChevronDown className="h-4 w-4" />
      </Button>
    </div>
  );
}
