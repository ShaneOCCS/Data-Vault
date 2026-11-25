'use client';

import { useRef, useState } from 'react';
import { AlertCircle, FileText, Loader2, ScanLine, Search, Upload } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { ingestCsv, type MemberSummary } from '@/lib/admin-api';
import { ApiError } from '@/lib/api';
import { BarcodeScannerDialog } from '@/components/admin/BarcodeScannerDialog';
import { useT } from '@/lib/i18n';

export interface LastIngest {
  kitId: string;
  batchId: string;
  rowCount: number;
}

interface UploadDocumentsTabProps {
  members: MemberSummary[];
  lastIngest: LastIngest | null;
  onIngested: (ingest: LastIngest) => void;
}

// Same rule the backend applies: exact KIT ID, any case for the extension.
function fileMatchesKitId(fileName: string, kitId: string) {
  return fileName.toLowerCase().endsWith('.csv') && fileName.slice(0, -'.csv'.length) === kitId;
}

export function UploadDocumentsTab({ members, lastIngest, onIngested }: UploadDocumentsTabProps) {
  const { toast } = useToast();
  const { t } = useT();
  const [selectedKitId, setSelectedKitId] = useState('');
  const [kitSearch, setKitSearch] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    e.target.value = ''; // so picking the same file again after fixing a problem still fires this handler
    if (!file || !selectedKitId) return;
    if (!fileMatchesKitId(file.name, selectedKitId)) {
      setUploadError(t("This file is named \"{file}\", but {kitId} needs a file named {kitId}.csv. Please check that this is the right person's file.", { file: file.name, kitId: selectedKitId }));
      return;
    }
    setUploading(true);
    setUploadError('');
    try {
      const result = await ingestCsv(selectedKitId, file);
      onIngested({ kitId: selectedKitId, batchId: result.batchId, rowCount: result.rowCount });
      toast({ variant: 'success', title: 'CSV uploaded', description: t('{n} row(s) added for {kitId}.', { n: result.rowCount, kitId: selectedKitId }) });
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Please try again — we couldn't ingest that file.";
      setUploadError(message);
    } finally {
      setUploading(false);
    }
  };

  const handleBarcodeScan = (value: string) => {
    const normalized = value.trim().toUpperCase();
    const match = members.find((m) => m.kitId.toUpperCase() === normalized);
    if (match) {
      setSelectedKitId(match.kitId);
      setKitSearch('');
      toast({ variant: 'success', title: 'KIT ID scanned', description: t('Selected {kitId}.', { kitId: match.kitId }) });
    } else {
      setKitSearch(normalized);
      toast({ variant: 'destructive', title: 'No match found', description: t("\"{value}\" doesn't match any known KIT ID. Please check and try again.", { value: normalized }) });
    }
  };

  const filteredMembers = members.filter((m) => {
    const q = kitSearch.trim().toLowerCase();
    return !q || m.kitId.toLowerCase().includes(q);
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('KIT ID documents')}</CardTitle>
        <CardDescription>
          {t("Please upload a CSV for a KIT ID — each row becomes a record its owner can view on their personal dashboard. The file must be named after the KIT ID, for example QS9KAH6.csv. Uploads can't be removed from the app, and only your most recent one is shown below.")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {uploadError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{t(uploadError)}</AlertDescription>
          </Alert>
        )}
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="space-y-1.5 flex-1">
            <Label>{t('KIT ID')}</Label>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('Search by KIT ID...')}
                value={kitSearch}
                onChange={(e) => setKitSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={selectedKitId} onValueChange={setSelectedKitId}>
              <SelectTrigger>
                <SelectValue placeholder={t('Select a KIT ID')} />
              </SelectTrigger>
              <SelectContent>
                {filteredMembers.length === 0 && (
                  <div className="px-3 py-2 text-sm text-muted-foreground">{t('No KIT IDs match "{q}".', { q: kitSearch })}</div>
                )}
                {filteredMembers.map((m) => (
                  <SelectItem key={m.kitId} value={m.kitId}>
                    {m.kitId} — {m.registered ? t('Registered') : t('Pending')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={() => setScannerOpen(true)} className="h-10">
            <ScanLine className="h-4 w-4 mr-2" /> {t('Scan barcode')}
          </Button>
          <Button onClick={handleUploadClick} disabled={uploading} className="h-10">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Upload className="h-4 w-4 mr-2" /> {t('Upload file')}</>}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {lastIngest && (
          <div className="border rounded-lg px-4 py-3 flex items-center gap-3 bg-status-good-soft border-status-good-line">
            <div className="bg-status-good-soft p-2 rounded-lg"><FileText className="h-4 w-4 text-status-good-ink" /></div>
            <div>
              <p className="font-medium text-sm text-status-good-ink">{t('{n} row(s) uploaded for {kitId}', { n: lastIngest.rowCount, kitId: lastIngest.kitId })}</p>
              <p className="text-xs text-status-good-ink">{t('Batch {id}', { id: lastIngest.batchId })}</p>
            </div>
          </div>
        )}
      </CardContent>
      <BarcodeScannerDialog open={scannerOpen} onOpenChange={setScannerOpen} onScan={handleBarcodeScan} />
    </Card>
  );
}
