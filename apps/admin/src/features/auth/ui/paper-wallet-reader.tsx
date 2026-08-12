/**
 * Reads a paper wallet's QR code, by file or by camera.
 *
 * Upload comes first because this is a desktop console: an operator holding a
 * printed wallet is more likely to have a photo or a PDF export of it on the same
 * machine than to hold it up to a webcam. Camera is offered second for the case
 * where they do.
 *
 * `html5-qrcode` is imported lazily. It is the largest dependency this route
 * touches, and an operator signing in with a passkey never needs it.
 *
 * apps/web has its own scanner. That one is phone-shaped — it prefers the rear
 * camera, its controls are 44px touch targets, and its copy goes through lingui.
 * None of that applies here, and neither component belongs in a package: the
 * decode is a browser capability an app owns.
 */

import { type ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { FiCamera, FiLoader, FiUpload } from "react-icons/fi";

import { Button } from "#/components/ui/button";

type Html5QrcodeType = InstanceType<typeof import("html5-qrcode").Html5Qrcode>;

type ReaderMode = "choose" | "camera";

const READER_ELEMENT_ID = "admin-paper-wallet-reader";

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
  const readerRef = useRef<Html5QrcodeType | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Incremented on teardown. In-flight async work captures the current epoch and
  // bails out when it no longer matches, so a decode that resolves after the
  // operator moved on cannot sign them in.
  const epochRef = useRef(0);

  useEffect(() => {
    return () => {
      epochRef.current += 1;
      teardown(readerRef.current);
      readerRef.current = null;
    };
  }, []);

  const stopCamera = useCallback(() => {
    epochRef.current += 1;
    teardown(readerRef.current);
    readerRef.current = null;
    setCameraStarting(false);
    setMode("choose");
  }, []);

  const handleUpload = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      setError(null);
      const epoch = ++epochRef.current;

      const { Html5Qrcode } = await import("html5-qrcode");
      if (epochRef.current !== epoch) return;

      const reader = new Html5Qrcode(READER_ELEMENT_ID);
      readerRef.current = reader;

      try {
        const decoded = await reader.scanFile(file, false);
        if (epochRef.current !== epoch) return;
        onDecoded(decoded);
      } catch {
        if (epochRef.current !== epoch) return;
        setError("No QR code found in that image. Try a clearer scan or photo.");
      } finally {
        if (epochRef.current === epoch) {
          readerRef.current = null;
          // Cleared so selecting the same file again re-fires onChange.
          if (fileInputRef.current) fileInputRef.current.value = "";
        }
      }
    },
    [onDecoded],
  );

  const handleCamera = useCallback(async () => {
    setError(null);
    setCameraStarting(true);
    setMode("camera");
    const epoch = ++epochRef.current;

    const { Html5Qrcode } = await import("html5-qrcode");
    if (epochRef.current !== epoch) return;

    const reader = new Html5Qrcode(READER_ELEMENT_ID);
    readerRef.current = reader;

    try {
      const cameras = await Html5Qrcode.getCameras();
      if (epochRef.current !== epoch) return;

      if (!cameras.length) {
        setError("No camera found on this machine. Upload an image instead.");
        setMode("choose");
        return;
      }

      // First device, not a rear-camera search: a desktop has one webcam facing
      // the operator, and that is the one they will hold the wallet up to.
      await reader.start(
        cameras[0].id,
        { fps: 10, qrbox: { width: 260, height: 260 } },
        (decodedText) => {
          if (epochRef.current !== epoch) return;
          onDecoded(decodedText);
          void reader.stop().then(() => reader.clear());
          readerRef.current = null;
        },
        () => {},
      );
    } catch (err) {
      if (epochRef.current !== epoch) return;
      readerRef.current = null;
      setMode("choose");
      setError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Camera access was denied. Upload an image of the wallet instead."
          : "Could not start the camera. Upload an image of the wallet instead.",
      );
    } finally {
      if (epochRef.current === epoch) setCameraStarting(false);
    }
  }, [onDecoded]);

  return (
    <div className="space-y-3">
      {/*
        Mount point for html5-qrcode. Kept in the DOM while choosing, because
        scanFile needs the element to attach its canvas to.
      */}
      <div
        id={READER_ELEMENT_ID}
        className={mode === "camera" ? "border border-border bg-muted" : "sr-only size-0"}
      />

      {mode === "camera" ? (
        <div className="space-y-3">
          {cameraStarting ? (
            <div className="flex h-16 items-center justify-center gap-2 border border-border bg-card text-muted-foreground text-sm">
              <FiLoader className="size-4 animate-spin" />
              Starting camera...
            </div>
          ) : (
            <p className="text-center text-muted-foreground text-sm">
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
          <Button
            variant="outline"
            className="w-full"
            disabled={disabled}
            onClick={() => void handleCamera()}
          >
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

function teardown(reader: Html5QrcodeType | null) {
  if (!reader) return;
  if (reader.isScanning) {
    reader
      .stop()
      .then(() => reader.clear())
      .catch(() => {});
    return;
  }
  try {
    reader.clear();
  } catch {}
}
