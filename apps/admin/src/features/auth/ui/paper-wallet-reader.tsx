/**
 * Reads a paper wallet's QR code, by file or by camera.
 *
 * Upload comes first because this is a desktop console: an operator holding a
 * printed wallet is more likely to have a photo or a PDF export of it on the same
 * machine than to hold it up to a webcam. Camera is offered second for the case
 * where they do.
 *
 * Decoding is zxing-wasm, whose binary is fetched on the first scan, so an
 * operator signing in with a passkey never downloads it.
 *
 * apps/web has its own scanner. That one is phone-shaped — it prefers the rear
 * camera, its controls are 44px touch targets, and its copy goes through lingui.
 * None of that applies here, and neither component belongs in a package: the
 * decode is a browser capability an app owns.
 */

import { type ChangeEvent, useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { FiCamera, FiLoader, FiUpload } from "react-icons/fi";

import { Button } from "#/components/ui/button";
import { QrCameraError, startQrCamera } from "#/lib/qr-camera";
import { decodeQrImageFile } from "#/lib/qr-decode";

type ReaderMode = "choose" | "camera";

export function PaperWalletReader({
  onDecoded,
  disabled,
}: {
  onDecoded: (raw: string) => void;
  disabled?: boolean;
}) {
  const [mode, setMode] = useState<ReaderMode>("choose");
  const [error, setError] = useState<string | null>(null);
  const [cameraStarting, setCameraStarting] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Incremented on teardown. An in-flight upload decode captures the current
  // epoch and bails out when it no longer matches, so a decode that resolves
  // after the operator moved on cannot sign them in.
  const epochRef = useRef(0);

  useEffect(() => {
    return () => {
      epochRef.current += 1;
    };
  }, []);

  const onCameraDecoded = useEffectEvent((text: string) => {
    setMode("choose");
    onDecoded(text);
  });

  const onCameraError = useEffectEvent((err: unknown) => {
    const kind = err instanceof QrCameraError ? err.kind : "failed";
    setMode("choose");
    setError(
      kind === "denied"
        ? "Camera access was denied. Upload an image of the wallet instead."
        : kind === "no-camera"
          ? "No camera found on this machine. Upload an image instead."
          : "Could not start the camera. Upload an image of the wallet instead.",
    );
  });

  // The camera runs exactly while camera mode is shown. Leaving the mode or
  // unmounting aborts it, which releases the stream wherever it has got to.
  useEffect(() => {
    const video = videoRef.current;
    if (mode !== "camera" || !video) return;

    const controller = new AbortController();
    setCameraStarting(true);
    // `ideal`, not `exact`: a machine with one camera uses it whatever it faces,
    // and one with several (a phone, a laptop with a USB camera) gets the rear one
    // rather than the selfie lens.
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

  const stopCamera = useCallback(() => {
    epochRef.current += 1;
    setMode("choose");
  }, []);

  const handleUpload = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      setError(null);
      const epoch = ++epochRef.current;

      try {
        const decoded = await decodeQrImageFile(file);
        if (epochRef.current !== epoch) return;
        if (decoded === null) throw new Error("No QR code in image");
        onDecoded(decoded);
      } catch {
        if (epochRef.current !== epoch) return;
        setError("No QR code found in that image. Try a clearer scan or photo.");
      } finally {
        // Cleared so selecting the same file again re-fires onChange.
        if (epochRef.current === epoch && fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [onDecoded],
  );

  const handleCamera = useCallback(() => {
    setError(null);
    setMode("camera");
  }, []);

  return (
    <div className="space-y-3">
      {mode === "camera" ? (
        <div className="space-y-3">
          <div className="border-border relative flex aspect-video items-center justify-center overflow-hidden border bg-black">
            <video
              ref={videoRef}
              className="absolute inset-0 size-full object-contain"
              muted
              playsInline
              aria-hidden
            />
            {cameraStarting ? null : (
              // An aiming guide only: the whole frame is read.
              <div className="relative aspect-square h-3/5 border-2 border-white/90 shadow-[0_0_0_9999px_rgb(0_0_0/0.4)]" />
            )}
          </div>
          {cameraStarting ? (
            <div className="border-border bg-card text-muted-foreground flex h-16 items-center justify-center gap-2 border text-sm">
              <FiLoader className="size-4 animate-spin" />
              Starting camera...
            </div>
          ) : (
            <p className="text-muted-foreground text-center text-sm">
              Hold the paper wallet's QR code up to the camera.
            </p>
          )}
          <Button variant="ghost" className="w-full" onClick={stopCamera}>
            Cancel
          </Button>
        </div>
      ) : (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={(event) => void handleUpload(event)}
            className="hidden"
            aria-label="Upload a paper wallet image"
          />
          <Button
            className="w-full"
            disabled={disabled}
            onClick={() => fileInputRef.current?.click()}
          >
            <FiUpload />
            Upload paper wallet image
          </Button>
          <Button variant="outline" className="w-full" disabled={disabled} onClick={handleCamera}>
            <FiCamera />
            Scan with camera
          </Button>
        </>
      )}

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
