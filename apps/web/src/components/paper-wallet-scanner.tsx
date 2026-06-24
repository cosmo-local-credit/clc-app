import { Trans, useLingui } from "@lingui/react/macro";
import { Camera, LoaderCircle, Upload, X } from "lucide-react";
import type { ChangeEvent, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "#/components/ui";

type Html5QrcodeType = InstanceType<typeof import("html5-qrcode").Html5Qrcode>;
type ScanMode = "choose" | "camera" | "upload";
type ScanError = { type: "camera-denied"; message: string } | { type: "other"; message: string };

interface PaperWalletScannerProps {
  onKeyDecoded: (key: string) => void;
  onCancel: () => void;
  title?: ReactNode;
}

const SCANNER_ELEMENT_ID = "paper-wallet-scanner";

export function PaperWalletScanner({ onKeyDecoded, onCancel, title }: PaperWalletScannerProps) {
  const { t } = useLingui();
  const [mode, setMode] = useState<ScanMode>("choose");
  const [error, setError] = useState<ScanError | null>(null);
  const [cameraStarting, setCameraStarting] = useState(false);
  const scannerRef = useRef<Html5QrcodeType | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Incremented on cancel/unmount. In-flight async work captures the
  // current epoch and bails out if it no longer matches.
  const epochRef = useRef(0);

  useEffect(() => {
    return () => {
      epochRef.current += 1;
      teardownScanner(scannerRef.current);
      scannerRef.current = null;
    };
  }, []);

  const handleCameraScan = useCallback(async () => {
    setError(null);
    setCameraStarting(true);
    setMode("camera");
    const epoch = ++epochRef.current;

    const { Html5Qrcode } = await import("html5-qrcode");
    if (epochRef.current !== epoch) return;

    const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID);
    scannerRef.current = scanner;

    try {
      const devices = await Html5Qrcode.getCameras();
      if (epochRef.current !== epoch) return;

      if (!devices.length) {
        setError({
          type: "other",
          message: t`No camera found on this device.`,
        });
        setCameraStarting(false);
        return;
      }

      const backCamera =
        devices.find(
          (d) =>
            d.label.toLowerCase().includes("back") ||
            d.label.toLowerCase().includes("rear") ||
            d.label.toLowerCase().includes("environment"),
        ) ?? devices[0];

      await scanner.start(
        backCamera.id,
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          if (epochRef.current !== epoch) return;
          onKeyDecoded(decodedText);
          void scanner.stop().then(() => scanner.clear());
          scannerRef.current = null;
        },
        () => {},
      );
    } catch (err) {
      if (epochRef.current !== epoch) return;
      scannerRef.current = null;
      setError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? { type: "camera-denied", message: t`Camera access denied.` }
          : {
              type: "other",
              message: err instanceof Error ? err.message : t`Failed to start camera.`,
            },
      );
    } finally {
      if (epochRef.current === epoch) {
        setCameraStarting(false);
      }
    }
  }, [onKeyDecoded, t]);

  const handleFileUpload = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      setError(null);
      const epoch = ++epochRef.current;

      const { Html5Qrcode } = await import("html5-qrcode");
      if (epochRef.current !== epoch) return;

      const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID);
      scannerRef.current = scanner;

      try {
        const decoded = await scanner.scanFile(file, false);
        if (epochRef.current !== epoch) return;
        onKeyDecoded(decoded);
      } catch {
        if (epochRef.current !== epoch) return;
        setError({
          type: "other",
          message: t`No QR code found. Try again with a clearer image.`,
        });
      } finally {
        if (epochRef.current === epoch) {
          scannerRef.current = null;
          if (fileInputRef.current) fileInputRef.current.value = "";
        }
      }
    },
    [onKeyDecoded, t],
  );

  const handleCancel = useCallback(() => {
    epochRef.current += 1;
    teardownScanner(scannerRef.current);
    scannerRef.current = null;
    setError(null);
    setMode("choose");
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-medium text-sm">{title ?? <Trans>Paper Wallet</Trans>}</p>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t`Close paper wallet scanner`}
          onClick={onCancel}
        >
          <X className="size-4" />
        </Button>
      </div>

      {/*
				Mount point for html5-qrcode. Kept in DOM during upload mode
				so scanFile can access the internal canvas.
			*/}
      <div
        id={SCANNER_ELEMENT_ID}
        className={mode !== "camera" ? "sr-only size-0 overflow-hidden" : ""}
      />

      {mode === "choose" ? (
        <div className="space-y-2">
          <Button className="h-11 w-full" onClick={handleCameraScan} disabled={cameraStarting}>
            <Camera className="mr-2 size-4" />
            <Trans>Scan QR Code</Trans>
          </Button>
          <Button
            variant="outline"
            className="h-11 w-full"
            onClick={() => {
              setMode("upload");
              setError(null);
            }}
          >
            <Upload className="mr-2 size-4" />
            <Trans>Upload Image</Trans>
          </Button>
        </div>
      ) : mode === "camera" ? (
        <div className="space-y-3">
          {cameraStarting ? (
            <div className="flex h-[280px] items-center justify-center rounded-none border border-border bg-card">
              <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : null}
          {error && !cameraStarting ? (
            <div className="space-y-2">
              <p className="text-destructive text-xs">{error.message}</p>
              {error.type === "camera-denied" ? (
                <Button
                  variant="outline"
                  className="h-11 w-full"
                  onClick={() => {
                    setMode("upload");
                    setError(null);
                  }}
                >
                  <Upload className="mr-2 size-4" />
                  <Trans>Upload Image Instead</Trans>
                </Button>
              ) : null}
            </div>
          ) : null}
          <Button variant="ghost" className="w-full" onClick={handleCancel}>
            <Trans>Back</Trans>
          </Button>
        </div>
      ) : mode === "upload" ? (
        <div className="space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
            aria-label={t`Upload QR code image`}
          />
          <Button
            variant="outline"
            className="h-11 w-full"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="mr-2 size-4" />
            <Trans>Choose Image</Trans>
          </Button>
          {error ? <p className="text-destructive text-xs">{error.message}</p> : null}
          <Button variant="ghost" className="w-full" onClick={handleCancel}>
            <Trans>Back</Trans>
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function teardownScanner(scanner: Html5QrcodeType | null) {
  if (!scanner) return;
  if (scanner.isScanning) {
    scanner
      .stop()
      .then(() => scanner.clear())
      .catch(() => {});
  } else {
    try {
      scanner.clear();
    } catch {}
  }
}
