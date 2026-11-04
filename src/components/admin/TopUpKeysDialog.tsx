'use client';

import { useState } from 'react';
import { AlertCircle, Copy, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { topUpRecoveryKeys } from '@/lib/admin-api';
import { ApiError } from '@/lib/api';

// Mounted only while open, so each KIT ID starts with a clean form.
export function TopUpKeysDialog({ kitId, onClose }: { kitId: string; onClose: () => void }) {
  const { toast } = useToast();
  const [count, setCount] = useState(3);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [keys, setKeys] = useState<string[] | null>(null);

  const handleTopUp = async () => {
    if (!Number.isInteger(count) || count < 1 || count > 10) {
      setError('Please enter a whole number between 1 and 10.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const result = await topUpRecoveryKeys(kitId, count);
      setKeys(result.recoveryKeys);
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Please try again — we couldn't generate new recovery keys.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = () => {
    if (!keys) return;
    navigator.clipboard?.writeText(`KIT ID: ${kitId}\nRecovery keys:\n${keys.join('\n')}`);
    toast({ variant: 'success', title: 'Copied', description: `Please paste this somewhere safe — ${kitId}'s recovery keys won't be shown again.` });
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Top Up Recovery Keys</DialogTitle>
          <DialogDescription>
            Generate new recovery keys for {kitId}. These are shown once — copy them now.
          </DialogDescription>
        </DialogHeader>
        {!keys ? (
          <>
            <div className="space-y-1.5 py-2">
              <Label htmlFor="topup-count">How many? (1–10)</Label>
              <Input
                id="topup-count"
                type="number"
                min={1}
                max={10}
                value={count}
                onChange={(e) => setCount(parseInt(e.target.value, 10) || 0)}
              />
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button onClick={handleTopUp} disabled={submitting} className="w-full">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Generate Keys'}
            </Button>
          </>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 py-2">
              {keys.map((key) => (
                <code key={key} className="text-xs bg-muted px-2 py-1 rounded">{key}</code>
              ))}
            </div>
            <Button onClick={handleCopy} variant="outline" className="w-full">
              <Copy className="h-4 w-4 mr-2" /> Copy All
            </Button>
            <Button onClick={onClose} className="w-full">
              Done
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
