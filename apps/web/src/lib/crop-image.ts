import type { CropRect } from "@clc/core/features/images/crop";

/**
 * Encodes the chosen region of a file as a new image.
 *
 * WebP at a high quality: the storage service re-encodes to WebP anyway, so
 * handing it WebP means the bytes crossing a metered connection are the smallest
 * they can be without a second generation of loss.
 *
 * Lives in the app, not in @clc/api: this needs a canvas, and that package stays
 * usable from a React Native client.
 */
export async function cropToFile(source: File, rect: CropRect): Promise<File> {
  if (rect.outWidth <= 0 || rect.outHeight <= 0) return source;
  // Every failure here returns the original rather than throwing. A crop is an
  // improvement on the upload, not a precondition for it: the service still
  // resizes what it is given, so a browser without createImageBitmap or a 2d
  // context gets the pre-crop behaviour instead of a dead button.
  if (typeof createImageBitmap !== "function") return source;

  const bitmap = await createImageBitmap(source);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = rect.outWidth;
    canvas.height = rect.outHeight;

    const context = canvas.getContext("2d");
    // Nothing to draw on: hand back the original rather than an empty frame, and
    // let the service resize it as it would have before cropping existed.
    if (!context) return source;

    context.drawImage(
      bitmap,
      rect.sx,
      rect.sy,
      rect.sw,
      rect.sh,
      0,
      0,
      rect.outWidth,
      rect.outHeight,
    );

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.92),
    );
    if (!blob) return source;

    return new File([blob], replaceExtension(source.name), { type: "image/webp" });
  } finally {
    bitmap.close();
  }
}

function replaceExtension(name: string): string {
  const base = name.replace(/\.[^./\\]+$/, "");
  return `${base || "photo"}.webp`;
}
