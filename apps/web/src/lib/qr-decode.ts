/**
 * QR decoding for uploaded images and camera frames.
 *
 * zxing-wasm (ZXing-C++ compiled to WebAssembly) reads QR codes on every
 * browser. Where the platform ships a native BarcodeDetector that reads QR
 * codes (Chrome on Android and macOS), camera frames go to it instead, and an
 * upload zxing misses gets a second read from it.
 *
 * The fallback JS and same-origin .wasm binary load only when zxing is needed.
 * The binary comes from the same package as the JS that loads it: a binary
 * from another zxing-wasm version fails every decode.
 */

/** Camera frames are decoded at most this large; a 4K frame costs time and gains nothing. */
const MAX_FRAME_SIDE = 1280;

interface NativeBarcodeDetector {
  detect(source: ImageBitmapSource): Promise<Array<{ rawValue: string }>>;
}

interface NativeBarcodeDetectorConstructor {
  new (options: { formats: string[] }): NativeBarcodeDetector;
  getSupportedFormats(): Promise<string[]>;
}

async function nativeQrDetector(): Promise<NativeBarcodeDetector | null> {
  const Detector = (globalThis as { BarcodeDetector?: NativeBarcodeDetectorConstructor })
    .BarcodeDetector;
  if (!Detector) return null;
  try {
    const formats = await Detector.getSupportedFormats();
    return formats.includes("qr_code") ? new Detector({ formats: ["qr_code"] }) : null;
  } catch {
    return null;
  }
}

async function readQr(pixels: ImageData): Promise<string | null> {
  const { readQrWithZXing } = await import("./qr-zxing");
  return readQrWithZXing(pixels);
}

async function detectNatively(
  detector: NativeBarcodeDetector,
  source: ImageBitmapSource,
): Promise<string | null> {
  const [barcode] = await detector.detect(source);
  return barcode?.rawValue ?? null;
}

/**
 * Draws `source` onto white and returns its pixels. zxing reads RGB and ignores
 * alpha, so a transparent PNG's background would otherwise read as black.
 */
function flattenedPixels(
  source: CanvasImageSource,
  width: number,
  height: number,
  canvas = document.createElement("canvas"),
): ImageData | null {
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  context.drawImage(source, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
}

/**
 * Reads the QR code in an image file. Resolves to `null` when there is none;
 * rejects when the browser cannot decode the file as an image.
 *
 * The browser decodes the file, not zxing, so any format the browser shows
 * (WebP, AVIF, HEIC on Safari) can be scanned, and EXIF orientation is applied.
 */
export async function decodeQrImageFile(file: Blob): Promise<string | null> {
  const bitmap = await createImageBitmap(file);
  try {
    const pixels = flattenedPixels(bitmap, bitmap.width, bitmap.height);
    const text = pixels ? await readQr(pixels) : null;
    if (text !== null) return text;

    const detector = await nativeQrDetector();
    return detector ? await detectNatively(detector, bitmap).catch(() => null) : null;
  } finally {
    bitmap.close();
  }
}

/**
 * Returns a function that reads the QR code in a video's current frame, or
 * `null` when there is none. Uses the native detector while it works and
 * zxing otherwise; a native detector that throws is not asked again.
 */
export function createQrFrameReader(): (video: HTMLVideoElement) => Promise<string | null> {
  const canvas = document.createElement("canvas");
  let native: Promise<NativeBarcodeDetector | null> | null = null;

  return async (video) => {
    const { videoWidth, videoHeight } = video;
    if (!videoWidth || !videoHeight) return null;

    native ??= nativeQrDetector();
    const detector = await native;
    if (detector) {
      try {
        return await detectNatively(detector, video);
      } catch {
        native = Promise.resolve(null);
      }
    }

    const scale = Math.min(1, MAX_FRAME_SIDE / Math.max(videoWidth, videoHeight));
    const pixels = flattenedPixels(
      video,
      Math.round(videoWidth * scale),
      Math.round(videoHeight * scale),
      canvas,
    );
    return pixels ? readQr(pixels) : null;
  };
}
