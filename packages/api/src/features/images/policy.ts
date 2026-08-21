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
  | "report.image"
  | "offering.photo";

export type ImagePolicy = {
  /** Storage folder. Must be present in the service's `api.allowed_folders`. */
  folder: "profile" | "voucher" | "pool" | "report" | "offering";
  /** Requested output width. Must be one of the service's `image.allowed_widths`. */
  width: 400 | 800 | 1280;
  /**
   * The shape the image is displayed in, and therefore the shape it is cropped
   * to before upload. Absent means the image keeps whatever shape it arrives in.
   *
   * The storage service resizes but never crops, so without this an avatar taken
   * in landscape is stored letterboxed and every screen showing it round has to
   * throw away the sides at render time — the wrong pixels travel, and the person
   * choosing the photo never sees which ones survived.
   */
  aspect?: number;
  /**
   * How a picker frames the preview.
   *
   * Not derivable from `aspect`. A 1:1 crop is displayed as a circle when it is
   * an identity mark — an avatar, a voucher icon, a pool logo — and as a square
   * when it is a photograph of something. Both are cropped to the same ratio, so
   * only the preview differs, and getting it wrong shows the person choosing the
   * image a shape nothing else in the app will use.
   *
   * Absent means square, which is also what a purpose with no `aspect` gets.
   */
  preview?: "circle";
};

/**
 * Banners are 16:9 — the ratio the screens showing them already reserve, and one
 * a phone camera produces natively, so the common case crops to nothing.
 */
const BANNER_ASPECT = 16 / 9;

/**
 * Avatars stay 400px even in the admin console: the same object serves a mobile
 * detail screen and a desktop table row, and the table row is smaller. Banners
 * and post images are 1280px for the opposite reason — one object serves a
 * full-bleed phone header and a desktop audit view.
 */
export const IMAGE_POLICIES: Readonly<Record<ImagePurpose, ImagePolicy>> = {
  "profile.avatar": { folder: "profile", width: 400, aspect: 1, preview: "circle" },
  "voucher.icon": { folder: "voucher", width: 400, aspect: 1, preview: "circle" },
  "voucher.banner": { folder: "voucher", width: 1280, aspect: BANNER_ASPECT },
  "pool.image": { folder: "pool", width: 400, aspect: 1, preview: "circle" },
  "pool.banner": { folder: "pool", width: 1280, aspect: BANNER_ASPECT },
  // No aspect: a post photograph is the content, not an identity mark. Cropping
  // it to a house shape would throw away what the author chose to show.
  "report.image": { folder: "report", width: 1280 },
  // Square, and cropped to square before upload, because every surface that
  // shows an offering photo frames it square — the console's card grid and the
  // mobile tile both do. Letting it keep its own shape would mean the stored
  // object is one ratio and every screen crops it to another at render time,
  // which is the failure `aspect` exists to prevent: the seller would never see
  // which part of their own photo survives.
  //
  // A square, not a circle: it is a photograph of a thing, not an identity mark.
  //
  // 800px rather than a report's 1280 — the largest surface showing it is a
  // desktop card in the console, not a full-bleed header, and a 430px phone at 2x
  // is 860 device pixels, close enough that the extra bytes buy nothing.
  "offering.photo": { folder: "offering", width: 800, aspect: 1 },
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
