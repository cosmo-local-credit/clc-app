import { Trans, useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { useState } from "react";
import { RiCameraLine, RiCloseLine, RiUploadLine } from "react-icons/ri";
import { Button } from "#/components/ui/button";
import { Spinner } from "#/components/ui/spinner";
import { usePaperWalletScan } from "#/components/use-paper-wallet-scan";

type ScanMode = "choose" | "camera" | "upload";

interface PaperWalletScannerProps {
  onKeyDecoded: (key: string) => void;
  onCancel: () => void;
  title?: ReactNode;
}

export function PaperWalletScanner({ onKeyDecoded, onCancel, title }: PaperWalletScannerProps) {
  const { t } = useLingui();
  const [mode, setMode] = useState<ScanMode>("choose");
  const scan = usePaperWalletScan({
    cameraActive: mode === "camera",
    // Back to the choices once the camera has let go, so a payload the parent
    // rejects leaves something to press rather than a dead preview.
    onCameraDecoded: (text) => {
      setMode("choose");
      onKeyDecoded(text);
    },
    onImageDecoded: onKeyDecoded,
  });
  const { videoRef, fileInputRef, cameraStarting, error, handleFileUpload } = scan;

  function handleCameraScan() {
    scan.clearError();
    setMode("camera");
  }

  function handleCancel() {
    scan.cancel();
    setMode("choose");
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-medium text-sm">{title ?? <Trans>Sign-in card</Trans>}</p>
        <Button
          variant="ghost"
          size="icon"
          tap
          aria-label={t`Close sign-in card scanner`}
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
              scan.clearError();
            }}
          >
            <RiUploadLine className="me-2 size-4" />
            <Trans>Upload card image</Trans>
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
                    scan.clearError();
                  }}
                >
                  <RiUploadLine className="me-2 size-4" />
                  <Trans>Upload card image instead</Trans>
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
            aria-label={t`Upload card image`}
          />
          <Button
            variant="outline"
            tap
            className="w-full"
            onClick={() => fileInputRef.current?.click()}
          >
            <RiUploadLine className="me-2 size-4" />
            <Trans>Upload card image</Trans>
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
