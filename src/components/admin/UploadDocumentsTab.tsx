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
      setUploadError(`This file is named "${file.name}", but ${selectedKitId} needs a file named ${selectedKitId}.csv. Please check that this is the right person's file.`);
      return;
    }
    setUploading(true);
    setUploadError('');
    try {
      const result = await ingestCsv(selectedKitId, file);
      onIngested({ kitId: selectedKitId, batchId: result.batchId, rowCount: result.rowCount });
      toast({ variant: 'success', title: 'CSV Ingested', description: `Please note — ${result.rowCount} row(s) added for ${selectedKitId}.` });
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
      toast({ variant: 'success', title: 'KIT ID Scanned', description: `Selected ${match.kitId}.` });
    } else {
      setKitSearch(normalized);
      toast({ variant: 'destructive', title: 'No Match Found', description: `"${normalized}" doesn't match any known KIT ID. Please check and try again.` });
    }
  };

  const filteredMembers = members.filter((m) => {
    const q = kitSearch.trim().toLowerCase();
    return !q || m.kitId.toLowerCase().includes(q);
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>KIT ID Documents</CardTitle>
        <CardDescription>
          Please upload a CSV for a KIT ID — each row becomes a record its owner can view on their personal dashboard. The file must be named after the KIT ID, for example QS9KAH6.csv. Uploads can&apos;t be removed from the app, and only your most recent one is shown below.
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
                value={kitSearch}
                onChange={(e) => setKitSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={selectedKitId} onValueChange={setSelectedKitId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a KIT ID" />
              </SelectTrigger>
              <SelectContent>
                {filteredMembers.length === 0 && (
                  <div className="px-3 py-2 text-sm text-muted-foreground">No KIT IDs match &quot;{kitSearch}&quot;.</div>
                )}
                {filteredMembers.map((m) => (
                  <SelectItem key={m.kitId} value={m.kitId}>
                    {m.kitId} — {m.registered ? 'Registered' : 'Pending'}
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
            accept=".csv"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {lastIngest && (
          <div className="border rounded-lg px-4 py-3 flex items-center gap-3 bg-green-50 border-green-200">
            <div className="bg-green-100 p-2 rounded-lg"><FileText className="h-4 w-4 text-green-700" /></div>
            <div>
              <p className="font-medium text-sm text-green-800">{lastIngest.rowCount} row(s) ingested for {lastIngest.kitId}</p>
              <p className="text-xs text-green-700">Batch {lastIngest.batchId}</p>
            </div>
          </div>
        )}
      </CardContent>
      <BarcodeScannerDialog open={scannerOpen} onOpenChange={setScannerOpen} onScan={handleBarcodeScan} />
    </Card>
  );
}
