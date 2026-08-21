/**
 * The geometry behind a fixed-aspect crop.
 *
 * Pure numbers on purpose: the same maths drives a bottom sheet on a phone and a
 * dialog on a desktop console, and neither the DOM nor React belongs in this
 * package. What each app adds is the pointer handling and the canvas encode.
 *
 * The model is a viewport the image always *covers*: at zoom 1 the image is
 * scaled until it fills the frame, so there is never a transparent margin inside
 * a crop, and the offset is clamped to keep it that way. Every function here is
 * total — given a nonsensical zoom or offset it returns the nearest valid one
 * rather than throwing, because a drag handler is not a place to handle errors.
 */

export type Size = {
  width: number;
  height: number;
};

/** Pan, in viewport pixels, from the centred position. */
export type Offset = {
  x: number;
  y: number;
};

export type CropView = {
  /** The image's intrinsic size. */
  natural: Size;
  /** The frame being cropped to, in CSS pixels. */
  viewport: Size;
  /** 1 is "cover the frame"; larger crops tighter. */
  zoom: number;
  offset: Offset;
};

/** The region of the source to keep, plus the size to encode it at. */
export type CropRect = {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  outWidth: number;
  outHeight: number;
};

/** Zoom beyond this turns a crop into a blur, whatever the source resolution. */
export const MAX_CROP_ZOOM = 4;

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(Math.max(zoom, 1), MAX_CROP_ZOOM);
}

/**
 * The scale at which the image covers the viewport, before zoom.
 *
 * Zero for a degenerate size rather than Infinity: a caller mid-load has no
 * dimensions yet, and NaN spreading through a transform is harder to see than a
 * frame that has not drawn.
 */
export function coverScale(natural: Size, viewport: Size): number {
  if (natural.width <= 0 || natural.height <= 0) return 0;
  return Math.max(viewport.width / natural.width, viewport.height / natural.height);
}

/** How far the image can pan before its edge would enter the frame. */
export function maxOffset(view: CropView): Offset {
  const scale = coverScale(view.natural, view.viewport) * clampZoom(view.zoom);
  return {
    x: Math.max(0, (view.natural.width * scale - view.viewport.width) / 2),
    y: Math.max(0, (view.natural.height * scale - view.viewport.height) / 2),
  };
}

/**
 * The nearest pan that still covers the frame.
 *
 * Called on every pointer move, and again after a zoom out — which is the case
 * that matters: shrinking the image with the pan left where it was would expose
 * an edge, so the offset has to follow the zoom rather than be validated against
 * it.
 */
export function clampOffset(view: CropView): Offset {
  const limit = maxOffset(view);
  return {
    x: Math.min(Math.max(view.offset.x, -limit.x), limit.x),
    y: Math.min(Math.max(view.offset.y, -limit.y), limit.y),
  };
}

/**
 * The source rectangle the crop keeps, and the size to encode it at.
 *
 * `maxWidth` is the stored width from the image policy. The output never exceeds
 * the source region, because upscaling here would hand the storage service more
 * pixels than the photograph has — it does not upscale either, so the only effect
 * would be a larger file carrying no more detail.
 */
export function cropRect(view: CropView, maxWidth: number): CropRect {
  const zoom = clampZoom(view.zoom);
  const scale = coverScale(view.natural, view.viewport) * zoom;
  if (scale <= 0) return { sx: 0, sy: 0, sw: 0, sh: 0, outWidth: 0, outHeight: 0 };

  const offset = clampOffset({ ...view, zoom });
  const limit = maxOffset({ ...view, zoom });

  const sw = view.viewport.width / scale;
  const sh = view.viewport.height / scale;
  const outWidth = Math.max(1, Math.round(Math.min(maxWidth, sw)));

  return {
    sx: (limit.x - offset.x) / scale,
    sy: (limit.y - offset.y) / scale,
    sw,
    sh,
    outWidth,
    // Derived from the encoded width so the output matches the frame's aspect
    // exactly, rather than accumulating a rounding error in the second axis.
    outHeight: Math.max(1, Math.round((outWidth * sh) / sw)),
  };
}

/**
 * A viewport of the given aspect that fits inside `available`.
 *
 * The frame is the crop, so it cannot be sized by CSS alone: the encode reads
 * these numbers back. Width-led, falling back to height when the aspect is
 * wider than the space — a banner on a phone hits that on every screen.
 */
export function fitViewport(available: Size, aspect: number): Size {
  if (aspect <= 0 || available.width <= 0) return { width: 0, height: 0 };
  const width = Math.min(available.width, available.height * aspect);
  return { width, height: width / aspect };
}
