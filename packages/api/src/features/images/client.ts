/**
 * The multipart transport for storage-server, and the failure type it throws.
 *
 * Deliberately not built on `HttpClient`: that client supplies
 * `Content-Type: application/json` whenever there is a body, sends credentials,
 * and unwraps a `{ ok, result }` envelope. A multipart upload must let the
 * browser generate its own boundary, carries a bearer token instead of a cookie,
 * and answers `{ ok, payload }`.
 *
 * `StorageApiError` is its own class rather than a `BackendApiError` subclass, and
 * that is load-bearing: both apps route an unauthenticated `BackendApiError` into
 * session handling from a cache-level `onError`, and the admin console clears every
 * `["clc"]` query and sends the operator back to sign-in. A rejected upload token
 * must not do that.
 */

import { sha256, stringToBytes } from "viem";

import { normalizeBaseUrl } from "../../client/http-client";
import { parseRetryAfterMs } from "../../client/errors";
import { IMAGE_POLICIES, type ImagePurpose, type UploadContentType } from "./policy";

/** One stored object, as the service reports it after normalization. */
export type UploadedImage = {
  url: string;
  /** Actual output dimensions, which are the source's when it was narrower. */
  width: number;
  height: number;
  byteSize: number;
  contentType: UploadContentType;
};

export type UploadImageInput = {
  file: File;
  purpose: ImagePurpose;
  /**
   * Opaque id, generated before `mutate` is called and reused by every retry.
   *
   * The object key is `<folder>/<uploadId>_<width>_<contentHash>.<ext>`, so a
   * stable id is what makes a retry land on the same object instead of creating a
   * second one. Generating it inside the mutation function would defeat that.
   */
  uploadId: string;
  signal?: AbortSignal;
};

export type ImportImageInput = {
  /** The https source storage-server fetches, if its host is on the service's allowlist. */
  source: string;
  purpose: ImagePurpose;
  /** From `imageImportUploadId(source)`, so a repeated import lands on the same object. */
  uploadId: string;
  signal?: AbortSignal;
};

/**
 * The import's object name, derived from its source: reloading a prefilled
 * link then lands on `<folder>/<uploadId>_<width>_<contentHash>.<ext>` again
 * rather than a new object.
 */
export function imageImportUploadId(source: string): string {
  return sha256(stringToBytes(source)).slice(2, 34);
}

/**
 * The crop the service applies to an import, which has nobody to frame it.
 * Only the shapes a purpose may declare; a purpose with none keeps its shape.
 */
function importAspect(aspect: number | undefined): string | undefined {
  if (aspect === 1) return "1:1";
  if (aspect !== undefined && Math.abs(aspect - 16 / 9) < 1e-9) return "16:9";
  return undefined;
}

export type StorageErrorKind =
  /** No response at all: offline, DNS, TLS, CORS, dropped socket. */
  | "network"
  /** The service or a proxy gave up mid-request. */
  | "timeout"
  /** The token was missing, expired, or not signed by the configured key. */
  | "unauthorized"
  /** The service refused this file or these fields. No retry can help. */
  | "rejected"
  | "server"
  /** A 2xx whose body did not match the documented contract. */
  | "protocol";

export class StorageApiError extends Error {
  readonly kind: StorageErrorKind;
  readonly retryAfterMs?: number;

  constructor(
    public readonly status: number,
    description: string,
    public readonly code?: string,
    options: { kind: StorageErrorKind; retryAfterMs?: number; cause?: unknown } = {
      kind: "protocol",
    },
  ) {
    super(description, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "StorageApiError";
    this.kind = options.kind;
    this.retryAfterMs = options.retryAfterMs;
  }
}

/**
 * Maps a status to a kind.
 *
 * The service's statuses do not line up with the usual reading, so this cannot be
 * a generic classifier: an unsupported container is `400 UNSUPPORTED_FILE_EXTENSION`
 * rather than 415, an over-cap pixel count is `400 IMAGE_TOO_LARGE` rather than
 * 413, and 429 is never emitted. Everything in the 400 family is terminal for the
 * selected file.
 */
function classifyStorageStatus(status: number): StorageErrorKind {
  if (status === 401) return "unauthorized";
  if (status === 408) return "timeout";
  if (status >= 500) return "server";
  return "rejected";
}

/**
 * An import's codes say more than its status. The source could not be fetched
 * is a network failure on the far side, worth the one retry; a host off the
 * allowlist or content that is not an image never will be.
 */
const STORAGE_CODE_KINDS: Readonly<Record<string, StorageErrorKind>> = {
  IMPORT_FETCH_FAILED: "network",
  IMPORT_HOST_NOT_ALLOWED: "rejected",
  IMPORT_CONTENT_REJECTED: "rejected",
};

export function isRetryableStorageError(error: unknown): boolean {
  if (!(error instanceof StorageApiError)) return false;
  return error.kind === "network" || error.kind === "timeout" || error.kind === "server";
}

export function isStorageUnauthorized(error: unknown): boolean {
  return error instanceof StorageApiError && error.kind === "unauthorized";
}

export type ImageUploadClient = {
  upload(input: UploadImageInput, token: string): Promise<UploadedImage>;
  /** Has storage-server fetch, crop and store an image from an allowlisted host. */
  import(input: ImportImageInput, token: string): Promise<UploadedImage>;
  readonly baseUrl: string;
};

type UploadEnvelope = {
  ok?: boolean;
  code?: string;
  payload?: {
    s3?: unknown;
    width?: unknown;
    height?: unknown;
    byteSize?: unknown;
    contentType?: unknown;
  };
};

export type CreateImageUploadClientOptions = {
  /** Absolute storage origin, from `VITE_STORAGE_URL`. */
  baseUrl: string;
  /** Injectable for tests; the platform `fetch` is resolved per request otherwise. */
  fetch?: typeof globalThis.fetch;
};

export function createImageUploadClient({
  baseUrl,
  fetch: fetchImpl,
}: CreateImageUploadClientOptions): ImageUploadClient {
  const normalizedBaseUrl = normalizeBaseUrl(
    baseUrl,
    "storage-server",
    "Pass a VITE_STORAGE_URL-derived value to createImageUploadClient",
  );
  const doFetch: typeof globalThis.fetch = fetchImpl ?? ((...args) => globalThis.fetch(...args));

  async function send(
    path: string,
    init: { headers: Record<string, string>; body: BodyInit; signal?: AbortSignal },
    fallbackByteSize: number,
  ): Promise<UploadedImage> {
    let res: Response;
    try {
      res = await doFetch(`${normalizedBaseUrl}${path}`, {
        method: "POST",
        credentials: "omit",
        ...init,
      });
    } catch (cause) {
      // A cancelled request is not a failure the caller should surface.
      if (cause instanceof Error && cause.name === "AbortError") throw cause;
      throw new StorageApiError(
        0,
        cause instanceof Error ? cause.message : "Could not reach the storage service",
        undefined,
        { kind: "network", cause },
      );
    }

    const retryAfterMs = parseRetryAfterMs(res.headers?.get?.("retry-after") ?? null);
    const text = await res.text();
    let body: UploadEnvelope | null = null;
    if (text) {
      try {
        body = JSON.parse(text) as UploadEnvelope;
      } catch (cause) {
        // An unintelligible body on an error status is still that error: a 502
        // HTML page from a proxy is a server fault and worth one retry.
        throw new StorageApiError(
          res.status,
          res.statusText || "Non-JSON storage response",
          undefined,
          {
            kind: res.ok ? "protocol" : classifyStorageStatus(res.status),
            retryAfterMs,
            cause,
          },
        );
      }
    }

    if (!res.ok || body?.ok !== true) {
      const code = body?.code;
      throw new StorageApiError(res.status, code ?? res.statusText ?? "Upload failed", code, {
        kind:
          (code ? STORAGE_CODE_KINDS[code] : undefined) ??
          (res.ok ? "rejected" : classifyStorageStatus(res.status)),
        retryAfterMs,
      });
    }

    const payload = body.payload;
    const url = typeof payload?.s3 === "string" ? payload.s3 : "";
    if (!url) {
      throw new StorageApiError(res.status, "Storage response carried no object URL", undefined, {
        kind: "protocol",
      });
    }

    // Older deployments answer with `s3` alone. Zeroed dimensions say "unknown"
    // rather than pretending to a size, which a caller reserving space can test.
    return {
      url,
      width: typeof payload?.width === "number" ? payload.width : 0,
      height: typeof payload?.height === "number" ? payload.height : 0,
      byteSize: typeof payload?.byteSize === "number" ? payload.byteSize : fallbackByteSize,
      contentType:
        typeof payload?.contentType === "string"
          ? (payload.contentType as UploadContentType)
          : "image/webp",
    };
  }

  return {
    baseUrl: normalizedBaseUrl,

    async upload(input, token) {
      const policy = IMAGE_POLICIES[input.purpose];

      // Exactly the four fields the service reads. Content-Type is left unset so
      // the browser writes it with its own multipart boundary.
      const form = new FormData();
      form.append("file", input.file);
      form.append("folder", policy.folder);
      form.append("name", input.uploadId);
      form.append("width", String(policy.width));

      return send(
        "/v1/upload",
        {
          // The token is the credential; a cookie for this host would be neither
          // sent nor wanted.
          headers: { Authorization: `Bearer ${token}` },
          body: form,
          signal: input.signal,
        },
        input.file.size,
      );
    },

    async import(input, token) {
      const policy = IMAGE_POLICIES[input.purpose];
      const aspect = importAspect(policy.aspect);
      return send(
        "/v1/import",
        {
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            url: input.source,
            folder: policy.folder,
            uploadId: input.uploadId,
            width: policy.width,
            ...(aspect ? { aspect } : {}),
          }),
          signal: input.signal,
        },
        0,
      );
    },
  };
}
