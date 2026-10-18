import { Trans, useLingui } from "@lingui/react/macro";
import type { ChangeEvent, ReactNode } from "react";
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { RiCameraLine, RiCloseLine, RiUploadLine } from "react-icons/ri";
import { Button } from "#/components/ui/button";
import { Spinner } from "#/components/ui/spinner";
import { QrCameraError, startQrCamera } from "#/lib/qr-camera";
import { decodeQrImageFile } from "#/lib/qr-decode";

type ScanMode = "choose" | "camera" | "upload";
type ScanError = { type: "camera-denied"; message: string } | { type: "other"; message: string };

interface PaperWalletScannerProps {
  onKeyDecoded: (key: string) => void;
  onCancel: () => void;
  title?: ReactNode;
}

export function PaperWalletScanner({ onKeyDecoded, onCancel, title }: PaperWalletScannerProps) {
  const { t } = useLingui();
  const [mode, setMode] = useState<ScanMode>("choose");
  const [error, setError] = useState<ScanError | null>(null);
  const [cameraStarting, setCameraStarting] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Incremented on cancel/unmount. An in-flight upload decode captures the
  // current epoch and bails out if it no longer matches.
  const epochRef = useRef(0);

  useEffect(() => {
    return () => {
      epochRef.current += 1;
    };
  }, []);

  // Back to the choices once the camera has let go, so a payload the parent
  // rejects leaves something to press rather than a dead preview.
  const onCameraDecoded = useEffectEvent((text: string) => {
    setMode("choose");
    onKeyDecoded(text);
  });

  const onCameraError = useEffectEvent((err: unknown) => {
    const kind = err instanceof QrCameraError ? err.kind : "failed";
    setError(
      kind === "denied"
        ? { type: "camera-denied", message: t`Camera access denied.` }
        : kind === "no-camera"
          ? { type: "other", message: t`No camera found on this device.` }
          : { type: "other", message: t`Failed to start camera.` },
    );
  });

  // The camera runs exactly while camera mode is shown. Leaving the mode or
  // unmounting aborts it, which releases the stream wherever it has got to.
  useEffect(() => {
    const video = videoRef.current;
    if (mode !== "camera" || !video) return;

    const controller = new AbortController();
    setCameraStarting(true);
    startQrCamera(video, {
      facingMode: "environment",
      onDecoded: onCameraDecoded,
      signal: controller.signal,
    })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) onCameraError(err);
      })
      .finally(() => {
        if (!controller.signal.aborted) setCameraStarting(false);
      });

    return () => {
      controller.abort();
      setCameraStarting(false);
    };
  }, [mode]);

  const handleCameraScan = useCallback(() => {
    setError(null);
    setMode("camera");
  }, []);

  const handleFileUpload = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      setError(null);
      const epoch = ++epochRef.current;

      try {
        const decoded = await decodeQrImageFile(file);
        if (epochRef.current !== epoch) return;
        if (decoded === null) throw new Error("No QR code in image");
        onKeyDecoded(decoded);
      } catch {
        if (epochRef.current !== epoch) return;
        setError({
          type: "other",
          message: t`No QR code found. Try again with a clearer image.`,
        });
      } finally {
        if (epochRef.current === epoch && fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [onKeyDecoded, t],
  );

  const handleCancel = useCallback(() => {
    epochRef.current += 1;
    setError(null);
    setMode("choose");
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-medium text-sm">{title ?? <Trans>Paper Wallet</Trans>}</p>
        <Button
          variant="ghost"
          size="icon"
          tap
          aria-label={t`Close paper wallet scanner`}
          onClick={onCancel}
        >
          <RiCloseLine className="size-4" />
        </Button>
      </div>

      {mode === "choose" ? (
        <div className="space-y-2">
          <Button tap className="w-full" onClick={handleCameraScan} disabled={cameraStarting}>
            <RiCameraLine className="me-2 size-4" />
            <Trans>Scan QR Code</Trans>
          </Button>
          <Button
            variant="outline"
            tap
            className="w-full"
            onClick={() => {
              setMode("upload");
              setError(null);
            }}
          >
            <RiUploadLine className="me-2 size-4" />
            <Trans>Upload Image</Trans>
          </Button>
        </div>
      ) : mode === "camera" ? (
        <div className="space-y-3">
          <div
            className={
              error
                ? "hidden"
                : "relative flex aspect-square items-center justify-center overflow-hidden border border-border bg-black"
            }
          >
            <video
              ref={videoRef}
              className="absolute inset-0 size-full object-cover"
              muted
              playsInline
              aria-hidden
            />
            {cameraStarting ? (
              <Spinner className="relative size-6 text-white/80" />
            ) : (
              // An aiming guide only: the whole frame is read.
              <div className="relative aspect-square w-3/5 border-2 border-white/90 shadow-[0_0_0_9999px_rgb(0_0_0/0.4)]" />
            )}
          </div>
          {error ? (
            <div className="space-y-2">
              <p className="text-destructive text-xs">{error.message}</p>
              {error.type === "camera-denied" ? (
                <Button
                  variant="outline"
                  tap
                  className="w-full"
                  onClick={() => {
                    setMode("upload");
                    setError(null);
                  }}
                >
                  <RiUploadLine className="me-2 size-4" />
                  <Trans>Upload Image Instead</Trans>
                </Button>
              ) : null}
            </div>
          ) : null}
          <Button variant="ghost" tap className="w-full" onClick={handleCancel}>
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
            tap
            className="w-full"
            onClick={() => fileInputRef.current?.click()}
          >
            <RiUploadLine className="me-2 size-4" />
            <Trans>Choose Image</Trans>
          </Button>
          {error ? <p className="text-destructive text-xs">{error.message}</p> : null}
          <Button variant="ghost" tap className="w-full" onClick={handleCancel}>
            <Trans>Back</Trans>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
