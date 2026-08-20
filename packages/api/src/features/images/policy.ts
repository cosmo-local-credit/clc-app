/**
 * What an upload is allowed to become, decided in one place.
 *
 * A screen picks a semantic purpose; it never picks a storage folder or a pixel
 * width. Those are a property of what the image is *for*, so two screens
 * uploading a voucher banner cannot disagree about its size, and adding a purpose
 * is the only way to introduce a new folder.
 *
 * The limits below mirror storage-server's own configuration. They are duplicated
 * here on purpose: a file the service will reject with a 400 should never leave
 * the device, and the client cannot read the service's config. When either side
 * moves, both move.
 */

export type ImagePurpose =
  | "profile.avatar"
  | "voucher.icon"
  | "voucher.banner"
  | "pool.image"
  | "pool.banner"
  | "report.image";

export type ImagePolicy = {
  /** Storage folder. Must be present in the service's `api.allowed_folders`. */
  folder: "profile" | "voucher" | "pool" | "report";
  /** Requested output width. Must be one of the service's `image.allowed_widths`. */
  width: 400 | 800 | 1280;
};

/**
 * Avatars stay 400px even in the admin console: the same object serves a mobile
 * detail screen and a desktop table row, and the table row is smaller. Banners
 * and post images are 1280px for the opposite reason — one object serves a
 * full-bleed phone header and a desktop audit view.
 */
export const IMAGE_POLICIES: Readonly<Record<ImagePurpose, ImagePolicy>> = {
  "profile.avatar": { folder: "profile", width: 400 },
  "voucher.icon": { folder: "voucher", width: 400 },
  "voucher.banner": { folder: "voucher", width: 1280 },
  "pool.image": { folder: "pool", width: 400 },
  "pool.banner": { folder: "pool", width: 1280 },
  "report.image": { folder: "report", width: 1280 },
};

/** The only containers storage-server can decode. Notably not HEIC. */
const UPLOAD_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type UploadContentType = (typeof UPLOAD_CONTENT_TYPES)[number];

/**
 * The largest file worth sending.
 *
 * The service's `api.max_body_size = 8` (MiB, shifted to bytes at startup) is a
 * limit on the whole request, not on the file: Echo's BodyLimit counts the
 * multipart boundaries and part headers too. A file of exactly 8 MiB is therefore
 * a 413, so the envelope is reserved here rather than being discovered by the
 * upload that fails.
 *
 * 64 KiB is far more than the envelope needs — four short parts and their
 * boundaries are a few hundred bytes — and losing that much of an 8 MiB budget
 * costs a caller nothing.
 */
const MAX_REQUEST_BYTES = 8 * 1024 * 1024;
const MULTIPART_ENVELOPE_RESERVE = 64 * 1024;
export const MAX_UPLOAD_BYTES = MAX_REQUEST_BYTES - MULTIPART_ENVELOPE_RESERVE;

export type ImageFileCheck =
  | { ok: true; contentType: UploadContentType }
  | { ok: false; reason: "unsupported-type" | "too-large" };

/**
 * Whether a selected file is worth uploading at all.
 *
 * Takes the two fields it actually reads rather than a `File`, so it is testable
 * without constructing one and honest about what it inspects.
 *
 * The service's other rejection — a source above 12.5 megapixels — is deliberately
 * not checked: pixel count is unknowable without decoding the image, and decoding
 * a 6 MB photo to pre-empt a rare 400 costs more than the 400 does. That case is
 * handled as a terminal upload failure instead.
 *
 * `unsupported-type` is the common one on iOS, where the Camera Roll hands over
 * HEIC. Convert before calling, or say so in the rejection copy — do not surface
 * the service's `UNSUPPORTED_FILE_EXTENSION` to a user.
 */
export function checkImageFile(file: { type: string; size: number }): ImageFileCheck {
  const contentType = UPLOAD_CONTENT_TYPES.find((candidate) => candidate === file.type);
  if (!contentType) return { ok: false, reason: "unsupported-type" };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, reason: "too-large" };
  return { ok: true, contentType };
}
