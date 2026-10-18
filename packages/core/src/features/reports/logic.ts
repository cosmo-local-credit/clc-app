import { z } from "zod";

/**
 * The post write document and its validation rules.
 *
 * The API calls the resource `reports`; product copy calls it Posts. The names
 * here follow the API so the write maps onto clc-core's document field for
 * field.
 *
 * Every limit mirrors clc-core's own — `ReportWriteRequest`'s validator tags and
 * `normalizeReportWrite`'s cross-field rules — so a document this schema accepts
 * is one the backend accepts. When one moves, both move. What is *not* here is
 * the 1 MB request body limit: that is a byte count over the whole serialized
 * write, so it belongs where the write is serialized, in `@clc/api`.
 */

/** The four workflow states, in workflow order. */
export const REPORT_STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"] as const;

export type ReportStatus = (typeof REPORT_STATUSES)[number];

export function isReportStatus(value: unknown): value is ReportStatus {
  return typeof value === "string" && (REPORT_STATUSES as readonly string[]).includes(value);
}

/** `FILE` is a downloadable document or video, `EMBED` an external player URL. */
export const REPORT_ATTACHMENT_KINDS = ["FILE", "EMBED"] as const;

export type ReportAttachmentKind = (typeof REPORT_ATTACHMENT_KINDS)[number];

export const REPORT_TITLE_MAX = 200;
export const REPORT_BODY_MAX = 500_000;
export const REPORT_DESCRIPTION_MAX = 10_000;
export const REPORT_HOST_NAME_MAX = 200;
export const REPORT_PARTICIPANTS_MAX = 100;
export const REPORT_TIME_TAKEN_MAX = 100;
const REPORT_TAG_MAX = 100;
export const REPORT_MAX_TAGS = 12;
export const REPORT_MAX_VOUCHERS = 12;
export const REPORT_MAX_IMAGES = 50;
export const REPORT_IMAGE_CAPTION_MAX = 500;
export const REPORT_MAX_ATTACHMENTS = 20;
export const REPORT_ATTACHMENT_FILENAME_MAX = 255;

/**
 * A stored media URL, never a `File` or a data URI.
 *
 * Bytes reach storage first and only the URL it returns is persisted, so by the
 * time a value arrives here the upload has happened. The scheme check mirrors
 * the column's CHECK constraint: clc-core refuses anything else.
 */
const storedMediaUrl = z
  .string()
  .trim()
  .refine((value) => /^https?:\/\//i.test(value), {
    message: "Media must be an uploaded http(s) URL",
  });

const reportTitleSchema = z
  .string()
  .trim()
  .min(1, { message: "Enter a title for your post" })
  .max(REPORT_TITLE_MAX, { message: "Title must be 200 characters or fewer" });

const reportBodySchema = z.string().max(REPORT_BODY_MAX, { message: "Post text is too long" });

const reportDescriptionSchema = z
  .string()
  .trim()
  .max(REPORT_DESCRIPTION_MAX, { message: "Summary must be 10,000 characters or fewer" });

/**
 * A coordinate, or nothing. The pair is checked on the object below: clc-core
 * rejects a half coordinate, so a form cannot offer one either.
 */
const latitudeSchema = z
  .number()
  .min(-90, { message: "Latitude must be between -90 and 90" })
  .max(90, { message: "Latitude must be between -90 and 90" })
  .nullable();

const longitudeSchema = z
  .number()
  .min(-180, { message: "Longitude must be between -180 and 180" })
  .max(180, { message: "Longitude must be between -180 and 180" })
  .nullable();

/**
 * A period end as an ISO timestamp, or `""` for unset.
 *
 * `""` rather than `null` so a date input can bind straight to it, and ISO
 * rather than the input's own `datetime-local` text so the value that validates
 * is the value that is sent. `toDateTimeLocalValue` and `fromDateTimeLocalValue`
 * convert at the input boundary.
 */
const reportInstantSchema = z.string().refine((value) => value === "" || isIsoInstant(value), {
  message: "Enter a valid date and time",
});

const reportVoucherRefSchema = z.object({
  chainId: z.number().int().positive({ message: "Choose a voucher" }),
  address: z
    .string()
    .trim()
    .regex(/^0x[0-9a-fA-F]{40}$/, { message: "Choose a voucher" }),
});

const optionalPositiveInt = z.number().int().positive().nullable();

const reportImageWriteSchema = z.object({
  url: storedMediaUrl,
  /**
   * The editor's display box, and advisory. Left null by everything this app
   * uploads — storage reports the intrinsic size, which goes on the pair below.
   */
  width: optionalPositiveInt,
  height: optionalPositiveInt,
  maxWidth: optionalPositiveInt,
  maxHeight: optionalPositiveInt,
  byteSize: optionalPositiveInt,
  caption: z
    .string()
    .trim()
    .max(REPORT_IMAGE_CAPTION_MAX, { message: "Caption must be 500 characters or fewer" })
    .nullable(),
});

const reportAttachmentWriteSchema = z.object({
  kind: z.enum(REPORT_ATTACHMENT_KINDS, { error: "Choose a file or an embed" }),
  url: storedMediaUrl,
  filename: z
    .string()
    .trim()
    .max(REPORT_ATTACHMENT_FILENAME_MAX, { message: "File name must be 255 characters or fewer" })
    .nullable(),
  byteSize: optionalPositiveInt,
});

/**
 * The complete editable document.
 *
 * `PUT` is assign-all, so this is also the shape of an edit: every key travels
 * every time, and an omitted one would be indistinguishable from a cleared one.
 * Author, status, modifier and timestamps are absent because the server derives
 * them; a form built from this schema cannot offer a field the server ignores.
 *
 * The optional free-text fields are `string` rather than `string | null` so an
 * input can bind to them directly. The API client is what turns `""` into the
 * explicit `null` the wire needs.
 */
const reportWriteObjectSchema = z.object({
  title: reportTitleSchema,
  body: reportBodySchema,
  description: reportDescriptionSchema,
  imageUrl: storedMediaUrl.nullable(),
  geoLat: latitudeSchema,
  geoLng: longitudeSchema,
  periodFrom: reportInstantSchema,
  periodTo: reportInstantSchema,
  hostName: z
    .string()
    .trim()
    .max(REPORT_HOST_NAME_MAX, { message: "Host must be 200 characters or fewer" }),
  /**
   * A head count, carried as text because the wire column is text and older
   * posts hold prose there. New writes must be a whole number — see the
   * refinement below — so an edit of a legacy post asks for one.
   */
  participants: z
    .string()
    .trim()
    .max(REPORT_PARTICIPANTS_MAX, { message: "Participants must be 100 characters or fewer" }),
  timeTaken: z
    .string()
    .trim()
    .max(REPORT_TIME_TAKEN_MAX, { message: "Duration must be 100 characters or fewer" }),
  tags: z
    .array(
      z
        .string()
        .trim()
        .min(1, { message: "Tags must not be blank" })
        .max(REPORT_TAG_MAX, { message: "Tags must be 100 characters or fewer" }),
    )
    .max(REPORT_MAX_TAGS, { message: "Choose at most 12 tags" }),
  vouchers: z
    .array(reportVoucherRefSchema)
    .max(REPORT_MAX_VOUCHERS, { message: "Link at most 12 vouchers" }),
  images: z
    .array(reportImageWriteSchema)
    .max(REPORT_MAX_IMAGES, { message: "Add at most 50 images" }),
  attachments: z
    .array(reportAttachmentWriteSchema)
    .max(REPORT_MAX_ATTACHMENTS, { message: "Add at most 20 attachments" }),
});

export const reportWriteSchema = reportWriteObjectSchema
  // Both halves of a location or neither. clc-core rejects a half coordinate,
  // and a map control that lost one is a bug, not a partial answer.
  .refine((value) => (value.geoLat === null) === (value.geoLng === null), {
    message: "Choose a place on the map or clear it",
    path: ["geoLat"],
  })
  // Already trimmed by the field schema, so blank is `""` here.
  .refine((value) => value.participants === "" || /^\d+$/.test(value.participants), {
    message: "Enter the number of participants as a whole number",
    path: ["participants"],
  })
  .refine(
    (value) =>
      value.periodFrom === "" ||
      value.periodTo === "" ||
      Date.parse(value.periodFrom) <= Date.parse(value.periodTo),
    { message: "The end of the period must not be before its start", path: ["periodTo"] },
  )
  // All four collections reject duplicates, matching one wire contract rather
  // than four: clc-core answers 400 for a repeated value in any of them.
  .refine((value) => isUnique(value.tags), {
    message: "Each tag can only be added once",
    path: ["tags"],
  })
  .refine((value) => isUnique(value.vouchers.map(voucherRefKey)), {
    message: "Each voucher can only be linked once",
    path: ["vouchers"],
  })
  .refine((value) => isUnique(value.images.map((image) => image.url.trim())), {
    message: "Each image can only be added once",
    path: ["images"],
  })
  .refine((value) => isUnique(value.attachments.map(attachmentKey)), {
    message: "Each attachment can only be added once",
    path: ["attachments"],
  });

/**
 * The same document, judged as an unfinished draft.
 *
 * A draft is restored from wherever an editor parked it, so what matters is that
 * the shape and the field limits still hold — not that the post is ready to
 * send. The one relaxed field is the title, which a finished post requires and a
 * draft is usually missing; the cross-field rules are dropped for the same
 * reason, since a period whose end precedes its start is a form mid-edit rather
 * than a document to throw away.
 */
export const reportDraftSchema = reportWriteObjectSchema.safeExtend({
  title: z.string().max(REPORT_TITLE_MAX, { message: "Title must be 200 characters or fewer" }),
});

export type ReportWrite = z.infer<typeof reportWriteSchema>;
export type ReportVoucherRef = z.infer<typeof reportVoucherRefSchema>;
export type ReportImageWrite = z.infer<typeof reportImageWriteSchema>;
export type ReportAttachmentWrite = z.infer<typeof reportAttachmentWriteSchema>;

/** A voucher's identity for deduplication: chain plus lower-cased address. */
export function voucherRefKey(voucher: ReportVoucherRef): string {
  return `${voucher.chainId}:${voucher.address.trim().toLowerCase()}`;
}

/**
 * An attachment's identity: kind and URL together. The same URL may appear once
 * as a `FILE` and once as an `EMBED`, which are two rows on the backend.
 */
function attachmentKey(attachment: ReportAttachmentWrite): string {
  return `${attachment.kind} ${attachment.url.trim()}`;
}

/**
 * Now, as the period a new post starts with: both ends at the current minute.
 *
 * Most posts are written as the thing happens, so the moment of writing is the
 * closest default; the author widens it when it was longer. To the minute rather
 * than the second because the pair is bound to two `datetime-local` inputs, and a
 * value they cannot represent would be silently rewritten the first time either
 * is touched.
 */
export function nowReportPeriod(now: Date = new Date()): {
  periodFrom: string;
  periodTo: string;
} {
  const minute = new Date(now);
  minute.setSeconds(0, 0);
  const iso = minute.toISOString();
  return { periodFrom: iso, periodTo: iso };
}

/** A blank post. Everything optional starts empty rather than defaulted. */
export const emptyReportWrite: ReportWrite = {
  title: "",
  body: "",
  description: "",
  imageUrl: null,
  geoLat: null,
  geoLng: null,
  periodFrom: "",
  periodTo: "",
  hostName: "",
  participants: "",
  timeTaken: "",
  tags: [],
  vouchers: [],
  images: [],
  attachments: [],
};

/**
 * What an editor loads a stored post into.
 *
 * Every field the server will replace is hydrated, including the ones an
 * operator may never open. `PUT` is assign-all, so a legacy attachment or an
 * image caption this drops is one the next save erases.
 */
export function reportToFormValues(report: ReportDetailSource): ReportWrite {
  return {
    title: report.title ?? "",
    body: report.body ?? "",
    description: report.description ?? "",
    imageUrl: report.imageUrl ?? null,
    geoLat: report.lat ?? null,
    geoLng: report.lng ?? null,
    periodFrom: report.periodFrom ?? "",
    periodTo: report.periodTo ?? "",
    hostName: report.hostName ?? "",
    participants: report.participants ?? "",
    timeTaken: report.timeTaken ?? "",
    tags: [...(report.tags ?? [])],
    vouchers: (report.vouchers ?? []).map((voucher) => ({
      chainId: voucher.chainId,
      address: voucher.address,
    })),
    images: (report.images ?? []).map((image) => ({
      url: image.url,
      width: image.width ?? null,
      height: image.height ?? null,
      maxWidth: image.maxWidth ?? null,
      maxHeight: image.maxHeight ?? null,
      byteSize: image.byteSize ?? null,
      caption: image.caption ?? null,
    })),
    attachments: (report.attachments ?? []).map((attachment) => ({
      kind: attachment.kind,
      url: attachment.url,
      filename: attachment.filename ?? null,
      byteSize: attachment.byteSize ?? null,
    })),
  };
}

/**
 * The shape `reportToFormValues` reads.
 *
 * Structural rather than an import of the API client's `ReportDetail`: this
 * package is the domain layer and does not depend on the network layer. The
 * managed detail satisfies it.
 */
export type ReportDetailSource = {
  title?: string | null;
  body?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  lat?: number | null;
  lng?: number | null;
  periodFrom?: string | null;
  periodTo?: string | null;
  hostName?: string | null;
  participants?: string | null;
  timeTaken?: string | null;
  tags?: readonly string[] | null;
  vouchers?: readonly { chainId: number; address: string }[] | null;
  images?: readonly ReportImageWrite[] | null;
  attachments?: readonly ReportAttachmentWrite[] | null;
};

/**
 * The validated, normalized write.
 *
 * Run before serialization rather than trusted to have run in the form:
 * TanStack Form validates against a Standard Schema but submits the caller's own
 * values, so `.trim()` shapes the error and not the value. Normalizing at the
 * one place every write passes through means the text that was validated is the
 * text that is sent.
 */
export function formValuesToReportWrite(values: ReportWrite): ReportWrite {
  return reportWriteSchema.parse(values);
}

/**
 * An ISO instant as an `<input type="datetime-local">` value, in local time.
 *
 * The input has no timezone, so the conversion is deliberately lossy in one
 * direction only: what comes back through `fromDateTimeLocalValue` is the same
 * wall-clock moment in the viewer's own zone.
 */
export function toDateTimeLocalValue(iso: string): string {
  if (iso === "") return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** A `datetime-local` value as an ISO instant, or `""` when the input is empty. */
export function fromDateTimeLocalValue(value: string): string {
  if (value.trim() === "") return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

/**
 * A stored file's size, for an attachment or image row.
 *
 * Unit abbreviations only, no locale policy: this package is platform-agnostic,
 * and both apps show the same "80 KB" beside a download link.
 */
export function formatByteSize(bytes: number | null): string | null {
  if (bytes === null || !Number.isFinite(bytes) || bytes <= 0) return null;
  if (bytes < 1024) return `${Math.round(bytes)} B`;

  const kib = bytes / 1024;
  if (kib < 1024) return `${roundToOneDecimal(kib)} KB`;
  return `${roundToOneDecimal(kib / 1024)} MB`;
}

function roundToOneDecimal(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/**
 * A Markdown link target this app will render, or `undefined` to drop the href.
 *
 * The renderer strips unknown schemes already, but its own docs say it is not a
 * complete sanitizer for user-generated content, and post bodies are exactly
 * that. This narrows it further to relative links plus `http(s)` and `mailto:`
 * — `tel:` and anything else become plain text.
 *
 * Control characters and whitespace are removed before the scheme is read, so
 * `java\nscript:` cannot smuggle a scheme past the check.
 */
export function safeMarkdownHref(href: string | undefined): string | undefined {
  if (!href) return undefined;
  const cleaned = href.trim().replace(/[\p{Cc}\s]+/gu, "");
  if (cleaned === "") return undefined;
  if (/^(#|\/|\.\/|\.\.\/)/.test(cleaned)) return cleaned;
  return /^(https?:|mailto:)/i.test(cleaned) ? cleaned : undefined;
}

/** Whether a safe href leaves the app, and so needs `rel` and a new tab. */
export function isExternalMarkdownHref(href: string): boolean {
  return /^(https?:|mailto:)/i.test(href.trim());
}

function isIsoInstant(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

function isUnique(keys: readonly string[]): boolean {
  return new Set(keys).size === keys.length;
}
