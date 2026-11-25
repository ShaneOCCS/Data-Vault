'use client';

import { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { Download, Printer, ScanBarcode, Search, X, CheckSquare, Square } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { MemberSummary } from '@/lib/admin-api';
import { useT } from '@/lib/i18n';
import { ListPager, usePagedList } from '@/components/admin/ListPager';

interface BarcodeGeneratorProps {
  members: MemberSummary[]; // CHANGED: was `accounts: Account[]`
}

// Renders a single KIT ID as a barcode onto an <svg>. jsbarcode draws
// directly into the DOM node, so this stays a small isolated component
// that re-renders its barcode whenever the value changes.
function BarcodeSvg({ value, forwardedRef }: { value: string; forwardedRef?: React.Ref<SVGSVGElement> }) {
  const localRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const node = (forwardedRef as React.RefObject<SVGSVGElement>)?.current ?? localRef.current;
    if (!node || !value) return;
    try {
      JsBarcode(node, value, {
        format: 'CODE128',
        width: 2,
        height: 60,
        displayValue: true,
        fontSize: 14,
        margin: 8,
      });
    } catch {
      // Invalid characters for the barcode format — leave the SVG empty.
    }
  }, [value, forwardedRef]);

  return <svg ref={forwardedRef ?? localRef} />;
}

export function BarcodeGenerator({ members }: BarcodeGeneratorProps) {
  const { t } = useT();
  // --- Single barcode ---
  const [singleKitId, setSingleKitId] = useState('');
  const singleSvgRef = useRef<SVGSVGElement>(null);

  const handleDownloadSingle = () => {
    if (!singleKitId) return;
    const dataUrl = generateBarcodeDataUrl(singleKitId);
    if (!dataUrl) return;
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `${singleKitId}-barcode.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintSingle = () => {
    if (!singleKitId) return;
    printBarcodes([{ kitId: singleKitId, dataUrl: generateBarcodeDataUrl(singleKitId) }]);
  };

  // --- Batch barcodes ---
  const [batchSearch, setBatchSearch] = useState('');
  const [selectedKitIds, setSelectedKitIds] = useState<Set<string>>(new Set());

  const batchFilteredMembers = members.filter((m) => {
    const q = batchSearch.trim().toLowerCase();
    if (!q) return true;
    return m.kitId.toLowerCase().includes(q);
  });
  const pagedBatch = usePagedList(batchFilteredMembers, batchSearch);

  const toggleKitId = (kitId: string) => {
    setSelectedKitIds((prev) => {
      const next = new Set(prev);
      if (next.has(kitId)) next.delete(kitId);
      else next.add(kitId);
      return next;
    });
  };

  const allFilteredSelected =
    batchFilteredMembers.length > 0 && batchFilteredMembers.every((m) => selectedKitIds.has(m.kitId));

  const toggleSelectAllFiltered = () => {
    setSelectedKitIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        batchFilteredMembers.forEach((m) => next.delete(m.kitId));
      } else {
        batchFilteredMembers.forEach((m) => next.add(m.kitId));
      }
      return next;
    });
  };

  const handlePrintBatch = () => {
    if (selectedKitIds.size === 0) return;
    const labels = Array.from(selectedKitIds).map((kitId) => ({
      kitId,
      dataUrl: generateBarcodeDataUrl(kitId),
    }));
    printBarcodes(labels);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ScanBarcode className="h-5 w-5" /> {t('Generate KIT ID barcodes')}
        </CardTitle>
        <CardDescription>{t('Please generate a printable barcode for one KIT ID, or a whole batch at once.')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* Single generation */}
        <div className="space-y-3">
          <Label className="text-sm font-semibold">{t('Single KIT ID')}</Label>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="space-y-1.5 flex-1">
              <Select value={singleKitId} onValueChange={setSingleKitId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('Select a KIT ID')} />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.kitId} value={m.kitId}>
                      {m.kitId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={handleDownloadSingle} disabled={!singleKitId}>
              <Download className="h-4 w-4 mr-2" /> {t('Download PNG')}
            </Button>
            <Button variant="outline" onClick={handlePrintSingle} disabled={!singleKitId}>
              <Printer className="h-4 w-4 mr-2" /> {t('Print')}
            </Button>
          </div>

          {singleKitId && (
            <div className="border rounded-lg p-4 bg-card flex justify-center">
              <BarcodeSvg value={singleKitId} forwardedRef={singleSvgRef} />
            </div>
          )}
        </div>

        <div className="border-t pt-6 space-y-3">
          <Label className="text-sm font-semibold">{t('Batch generate')}</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('Search by KIT ID...')}
              value={batchSearch}
              onChange={(e) => setBatchSearch(e.target.value)}
              className="pl-9 pr-9"
            />
            {batchSearch && (
              <button
                type="button"
                onClick={() => setBatchSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={t('Clear search')}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="border rounded-lg divide-y">
            {members.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">{t('No pending KIT IDs')}.</div>
            )}
            {members.length > 0 && batchFilteredMembers.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">{t('No KIT IDs match "{q}".', { q: batchSearch })}</div>
            )}
            {batchFilteredMembers.length > 0 && (
              <button
                type="button"
                onClick={toggleSelectAllFiltered}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-left hover:bg-muted/50"
              >
                {allFilteredSelected ? (
                  <CheckSquare className="h-4 w-4 text-primary" />
                ) : (
                  <Square className="h-4 w-4 text-muted-foreground" />
                )}
                {allFilteredSelected ? t('Deselect all') : t('Select all')}
                {batchSearch && ' (filtered)'}
              </button>
            )}
            {pagedBatch.visible.map((m) => {
              const checked = selectedKitIds.has(m.kitId);
              return (
                <button
                  type="button"
                  key={m.kitId}
                  onClick={() => toggleKitId(m.kitId)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    {checked ? (
                      <CheckSquare className="h-4 w-4 text-primary shrink-0" />
                    ) : (
                      <Square className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <div>
                      {/* CHANGED: real members have no name — show kitId + registered status instead */}
                      <p className="font-medium text-sm">{m.kitId}</p>
                      <p className="text-xs text-muted-foreground">{m.registered ? t('Registered') : t('Pending setup')}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          <ListPager {...pagedBatch.pager} />

          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {selectedKitIds.size} selected
            </p>
            <Button onClick={handlePrintBatch} disabled={selectedKitIds.size === 0}>
              <Printer className="h-4 w-4 mr-2" /> {t('Print / save batch as PDF')}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// --- Helpers ---

// Renders a KIT ID barcode straight onto an offscreen canvas and returns a
// PNG data URL. Kept fully self-contained (no external scripts or CDN calls)
// so KIT IDs are never sent to a third party.
function generateBarcodeDataUrl(value: string): string {
  const canvas = document.createElement('canvas');
  try {
    JsBarcode(canvas, value, {
      format: 'CODE128',
      width: 2,
      height: 60,
      displayValue: true,
      fontSize: 14,
      margin: 8,
    });
  } catch {
    return '';
  }
  return canvas.toDataURL('image/png');
}

// Opens a print-friendly popup with one barcode label per KIT ID, using
// pre-rendered PNG data URLs. The admin can then use the browser's print
// dialog to print physical labels or "Save as PDF" for a batch export.
function printBarcodes(labels: { kitId: string; dataUrl: string }[]) {
  const printWindow = window.open('', '_blank', 'width=900,height=700');
  if (!printWindow) return;

  const labelHtml = labels
    .filter((l) => l.dataUrl)
    .map(
      (l) => `
        <div class="label">
          <img src="${l.dataUrl}" alt="${escapeHtml(l.kitId)} barcode" />
        </div>`
    )
    .join('\n');

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>KIT ID Barcodes</title>
        <style>
          * { box-sizing: border-box; }
          body { font-family: system-ui, sans-serif; margin: 24px; }
          .grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
            gap: 16px;
          }
          .label {
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            page-break-inside: avoid;
          }
          .label img { max-width: 100%; height: auto; }
          @media print {
            .label { border: 1px solid #999; }
          }
        </style>
      </head>
      <body>
        <div class="grid">${labelHtml}</div>
        <script>
          window.onload = function () {
            setTimeout(function () { window.print(); }, 200);
          };
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c] as string));
}
