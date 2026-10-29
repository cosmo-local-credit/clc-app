import { useLingui } from "@lingui/react/macro";
import type { ChangeEvent } from "react";
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";

import { QrCameraError, startQrCamera } from "#/lib/qr-camera";
import { decodeQrImageFile } from "#/lib/qr-decode";

export type PaperWalletScanError =
  | { type: "camera-denied"; message: string }
  | { type: "other"; message: string };

/**
 * Reading a paper wallet's QR: the camera while `cameraActive` holds, and an
 * uploaded image. The phone scanner and the desktop camera canvas share it;
 * each draws its own video element and file input from the refs.
 */
export function usePaperWalletScan({
  cameraActive,
  onCameraDecoded,
  onImageDecoded,
}: {
  cameraActive: boolean;
  onCameraDecoded: (text: string) => void;
  onImageDecoded: (text: string) => void;
}) {
  const { t } = useLingui();
  const [error, setError] = useState<PaperWalletScanError | null>(null);
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

  const onDecoded = useEffectEvent((text: string) => onCameraDecoded(text));

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

  // The camera runs exactly while it is active. Leaving or unmounting aborts
  // it, which releases the stream wherever it has got to.
  useEffect(() => {
    const video = videoRef.current;
    if (!cameraActive || !video) return;

    const controller = new AbortController();
    setCameraStarting(true);
    startQrCamera(video, {
      facingMode: "environment",
      onDecoded,
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
  }, [cameraActive]);

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
        onImageDecoded(decoded);
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
    [onImageDecoded, t],
  );

  /** Drops an upload still decoding and clears the error. */
  const cancel = useCallback(() => {
    epochRef.current += 1;
    setError(null);
  }, []);

  return {
    videoRef,
    fileInputRef,
    cameraStarting,
    error,
    clearError: () => setError(null),
    handleFileUpload,
    cancel,
  };
}
