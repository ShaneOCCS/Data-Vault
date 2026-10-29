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
import type { Account } from '@/app/lib/local-db';

interface BarcodeGeneratorProps {
  accounts: Account[];
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

export function BarcodeGenerator({ accounts }: BarcodeGeneratorProps) {
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

  const batchFilteredAccounts = accounts.filter((acc) => {
    const q = batchSearch.trim().toLowerCase();
    if (!q) return true;
    return acc.kitId.toLowerCase().includes(q);
  });

  const toggleKitId = (kitId: string) => {
    setSelectedKitIds((prev) => {
      const next = new Set(prev);
      if (next.has(kitId)) next.delete(kitId);
      else next.add(kitId);
      return next;
    });
  };

  const allFilteredSelected =
    batchFilteredAccounts.length > 0 && batchFilteredAccounts.every((a) => selectedKitIds.has(a.kitId));

  const toggleSelectAllFiltered = () => {
    setSelectedKitIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        batchFilteredAccounts.forEach((a) => next.delete(a.kitId));
      } else {
        batchFilteredAccounts.forEach((a) => next.add(a.kitId));
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
          <ScanBarcode className="h-5 w-5 text-muted-foreground" /> Barcode labels
        </CardTitle>
        <CardDescription>Print a barcode label for one KIT ID or a whole batch.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* Single generation */}
        <div className="space-y-3">
          <Label className="text-sm font-semibold">Single KIT ID</Label>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="space-y-1.5 flex-1">
              <Select value={singleKitId} onValueChange={setSingleKitId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a KIT ID" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((acc) => (
                    <SelectItem key={acc.kitId} value={acc.kitId}>
                      {acc.kitId} — {acc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={handleDownloadSingle} disabled={!singleKitId}>
              <Download className="h-4 w-4 mr-2" /> Download PNG
            </Button>
            <Button variant="outline" onClick={handlePrintSingle} disabled={!singleKitId}>
              <Printer className="h-4 w-4 mr-2" /> Print
            </Button>
          </div>

          {singleKitId && (
            <div className="border rounded-lg p-4 bg-white flex justify-center">
              <BarcodeSvg value={singleKitId} forwardedRef={singleSvgRef} />
            </div>
          )}
        </div>

        <div className="border-t pt-6 space-y-3">
          <Label className="text-sm font-semibold">Batch Generate</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by KIT ID..."
              value={batchSearch}
              onChange={(e) => setBatchSearch(e.target.value)}
              className="pl-9 pr-9"
            />
            {batchSearch && (
              <button
                type="button"
                onClick={() => setBatchSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="border rounded-lg divide-y max-h-72 overflow-y-auto">
            {accounts.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">No KIT IDs yet.</div>
            )}
            {accounts.length > 0 && batchFilteredAccounts.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">No KIT IDs match "{batchSearch}".</div>
            )}
            {batchFilteredAccounts.length > 0 && (
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
                {allFilteredSelected ? 'Deselect all' : 'Select all'}
                {batchSearch && ' (filtered)'}
              </button>
            )}
            {batchFilteredAccounts.map((acc) => {
              const checked = selectedKitIds.has(acc.kitId);
              return (
                <button
                  type="button"
                  key={acc.kitId}
                  onClick={() => toggleKitId(acc.kitId)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    {checked ? (
                      <CheckSquare className="h-4 w-4 text-primary shrink-0" />
                    ) : (
                      <Square className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <div>
                      <p className="font-medium text-sm">{acc.name}</p>
                      <p className="text-xs text-muted-foreground">{acc.kitId}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {selectedKitIds.size} selected
            </p>
            <Button onClick={handlePrintBatch} disabled={selectedKitIds.size === 0}>
              <Printer className="h-4 w-4 mr-2" /> Print / Save Batch as PDF
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
// since the rest of this app runs entirely offline.
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
