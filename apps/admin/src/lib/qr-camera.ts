/**
 * Streams a camera into a <video> element and reads QR codes from it.
 *
 * Frames are read at 10 per second, one at a time: a slow decode delays the
 * next frame rather than queueing behind it. The whole frame is read, not a
 * centre crop, so a code held off-centre or close to the lens still scans.
 */

import { createQrFrameReader } from "#/lib/qr-decode";

const FRAME_INTERVAL_MS = 100;

export type QrCameraErrorKind = "denied" | "no-camera" | "failed";

export class QrCameraError extends Error {
  constructor(
    readonly kind: QrCameraErrorKind,
    options?: { cause?: unknown },
  ) {
    super(`Camera ${kind}`, options);
    this.name = "QrCameraError";
  }
}

function toCameraError(error: unknown): QrCameraError {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return new QrCameraError("denied", { cause: error });
    }
    if (error.name === "NotFoundError" || error.name === "OverconstrainedError") {
      return new QrCameraError("no-camera", { cause: error });
    }
  }
  return new QrCameraError("failed", { cause: error });
}

/**
 * Starts the camera and resolves once frames are being read. `onDecoded` is
 * called at most once, after the camera has been released. Aborting `signal`
 * releases the camera at any point, including while it is still starting.
 * Rejects with a `QrCameraError`, or not at all when aborted first.
 */
export async function startQrCamera(
  video: HTMLVideoElement,
  {
    facingMode,
    onDecoded,
    signal,
  }: {
    /** Omitted, the browser's default camera is used. */
    facingMode?: "environment" | "user";
    onDecoded: (text: string) => void;
    signal: AbortSignal;
  },
): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new QrCameraError("no-camera");
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: facingMode ? { facingMode: { ideal: facingMode } } : true,
    });
  } catch (error) {
    if (signal.aborted) return;
    throw toCameraError(error);
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const release = () => {
    clearTimeout(timer);
    for (const track of stream.getTracks()) track.stop();
    video.srcObject = null;
  };
  if (signal.aborted) {
    release();
    return;
  }
  signal.addEventListener("abort", release, { once: true });

  try {
    video.srcObject = stream;
    await video.play();
  } catch (error) {
    release();
    if (signal.aborted) return;
    throw toCameraError(error);
  }

  const readFrame = createQrFrameReader();
  const tick = async () => {
    const started = performance.now();
    const text = await readFrame(video).catch(() => null);
    if (signal.aborted) return;
    if (text !== null) {
      signal.removeEventListener("abort", release);
      release();
      onDecoded(text);
      return;
    }
    timer = setTimeout(tick, Math.max(0, FRAME_INTERVAL_MS - (performance.now() - started)));
  };
  void tick();
}
