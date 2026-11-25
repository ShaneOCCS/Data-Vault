'use client';

import { useEffect, useRef, useState } from 'react';
import type { BrowserMultiFormatReader } from '@zxing/browser';
import { ScanLine, AlertCircle, Loader2, Flashlight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useT } from '@/lib/i18n';

interface BarcodeScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScan: (value: string) => void;
}

// Turns a raw getUserMedia/decode error into an accurate, specific message
// instead of always blaming "permissions" regardless of the real cause.
function describeCameraError(error: unknown): string {
  const e = error as { name?: string; message?: string } | null | undefined;
  const name = e?.name ?? '';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'Camera access was denied. Please allow camera access for this site and try again, or type the KIT ID in manually.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return "No camera was found on this device. Please try a device with a camera, or type the KIT ID in manually.";
    case 'NotReadableError':
    case 'TrackStartError':
      return 'The camera is currently in use by another app or browser tab. Please close it and try again, or type the KIT ID in manually.';
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return "This device's camera doesn't support the requested settings. Please try a different device, or type the KIT ID in manually.";
    case 'AbortError':
      return 'Starting the camera was interrupted. Please try again.';
    default:
      return `Couldn't start the camera${e?.message ? `: ${e.message}` : ''}. Please type the KIT ID in manually.`;
  }
}

// Uses ZXing (pure JS/canvas decoding) instead of the native BarcodeDetector
// API, since BarcodeDetector isn't available on Safari/iOS — this way
// scanning works the same on iPhone, iPad, and Android/desktop Chrome.
// Camera access still requires a secure context (HTTPS or localhost) on
// every platform, iOS included — that's the browser's rule, not this app's.
export function BarcodeScannerDialog({ open, onOpenChange, onScan }: BarcodeScannerDialogProps) {
  const { t } = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<import('@zxing/browser').IScannerControls | null>(null);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(true);
  const [insecureContext, setInsecureContext] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [slowScan, setSlowScan] = useState(false);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setError('');
    setStarting(true);
    setSlowScan(false);
    setTorchOn(false);
    setTorchSupported(false);

    const slowScanTimer = setTimeout(() => {
      if (!cancelled) setSlowScan(true);
    }, 4000);

    const isSecure = typeof window !== 'undefined' && window.isSecureContext;
    setInsecureContext(!isSecure);
    if (!isSecure) {
      setStarting(false);
      clearTimeout(slowScanTimer);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser doesn't support camera access. Please type the KIT ID in manually.");
      setStarting(false);
      clearTimeout(slowScanTimer);
      return;
    }

    const start = async () => {
      try {
        // Loaded on demand — keeps ZXing (a fairly large decoder) out of the
        // main dashboard bundle, only fetching it when someone actually
        // opens the scanner.
        const [{ BrowserMultiFormatReader }, { DecodeHintType, BarcodeFormat }] = await Promise.all([
          import('@zxing/browser'),
          import('@zxing/library'),
        ]);
        if (cancelled) return;

        // Restricting to formats we actually generate (CODE128, plus common
        // ones) keeps each decode attempt fast by skipping checks for
        // formats we don't use. TRY_HARDER is intentionally left off — it
        // runs several slower passes per frame, which works against the
        // "many fast attempts per second" approach below that actually
        // gives that near-instant, point-and-go feel.
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
        ]);

        // The default is a 500ms pause between failed attempts (~2
        // scans/sec) — that's what makes it feel sluggish compared to a
        // dedicated retail scanner. Dropping this way down makes it check
        // near-continuously, so a good frame gets caught almost instantly.
        const reader = new BrowserMultiFormatReader(hints, {
          delayBetweenScanAttempts: 50,
          delayBetweenScanSuccess: 50,
        });
        readerRef.current = reader;

        // The second callback argument is ignored on purpose: NotFoundException
        // fires continuously while no barcode is in frame, and other decode
        // errors are transient, so scanning just continues.
        const onDecode = (result: import('@zxing/library').Result | undefined) => {
          if (cancelled || !result) return;
          const value = result.getText()?.trim();
          if (value) {
            onScan(value);
            onOpenChange(false);
          }
        };

        let controls;
        try {
          // Prefer the rear camera on phones/tablets. 720p is a sweet spot —
          // sharp enough to read a barcode clearly, without the extra
          // per-frame processing time a full 1080p feed adds (which fights
          // against fast, responsive scanning).
          controls = await reader.decodeFromConstraints(
            {
              video: {
                facingMode: 'environment',
                width: { ideal: 1280 },
                height: { ideal: 720 },
              },
            },
            videoRef.current!,
            onDecode
          );
        } catch (constraintErr) {
          // Laptops/desktops often only have a front camera, and some
          // browsers throw OverconstrainedError when 'environment' isn't
          // available rather than silently falling back. Retry with no
          // facing-mode preference so desktop testing still works.
          if (cancelled) throw constraintErr;
          controls = await reader.decodeFromConstraints(
            { video: { width: { ideal: 1280 }, height: { ideal: 720 } } },
            videoRef.current!,
            onDecode
          );
        }

        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        setTorchSupported(typeof controls.switchTorch === 'function');
        setStarting(false);
      } catch (e) {
        if (!cancelled) {
          setError(describeCameraError(e));
          setStarting(false);
        }
      }
    };

    start();

    return () => {
      cancelled = true;
      clearTimeout(slowScanTimer);
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [open, onOpenChange, onScan]);

  const toggleTorch = async () => {
    if (!controlsRef.current?.switchTorch) return;
    try {
      await controlsRef.current.switchTorch(!torchOn);
      setTorchOn((v) => !v);
    } catch {
      // Torch control is experimental and not all devices support it —
      // fail quietly rather than showing an error for a nice-to-have.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="h-5 w-5" /> {t('Scan KIT ID barcode')}
          </DialogTitle>
          <DialogDescription>
            {t('Please point the camera at a KIT ID barcode.')}
          </DialogDescription>
        </DialogHeader>

        {insecureContext ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {t('Camera scanning needs a secure connection (HTTPS), but this page is loaded over plain HTTP at {host}.', { host: typeof window !== 'undefined' ? window.location.host : '…' })}{' '}
              {t('Please open the app over HTTPS or via localhost, or type the KIT ID in manually for now.')}
            </AlertDescription>
          </Alert>
        ) : error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{t(error)}</AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-2">
            <div className="relative bg-black rounded-lg overflow-hidden aspect-video flex items-center justify-center">
              {starting && (
                <Loader2 className="h-6 w-6 text-white animate-spin absolute" />
              )}
              <video ref={videoRef} className="w-full h-full object-cover" muted playsInline autoPlay />
              <div className="absolute inset-x-8 inset-y-6 border-2 border-white/70 rounded-lg pointer-events-none" />
              {torchSupported && !starting && (
                <button
                  type="button"
                  onClick={toggleTorch}
                  className={`absolute bottom-3 right-3 rounded-full p-2 ${torchOn ? 'bg-yellow-400 text-black' : 'bg-black/60 text-white'}`}
                  aria-label={torchOn ? t('Turn off flashlight') : t('Turn on flashlight')}
                >
                  <Flashlight className="h-4 w-4" />
                </button>
              )}
            </div>
            {slowScan && !starting && (
              <p className="text-xs text-muted-foreground text-center">
                {t('Still looking — try holding it a bit closer, steadier, and out of glare. It works best when the barcode fills most of the frame.')}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
