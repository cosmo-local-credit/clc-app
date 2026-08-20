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

export function isRetryableStorageError(error: unknown): boolean {
  if (!(error instanceof StorageApiError)) return false;
  return error.kind === "network" || error.kind === "timeout" || error.kind === "server";
}

export function isStorageUnauthorized(error: unknown): boolean {
  return error instanceof StorageApiError && error.kind === "unauthorized";
}

export type ImageUploadClient = {
  upload(input: UploadImageInput, token: string): Promise<UploadedImage>;
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

      let res: Response;
      try {
        res = await doFetch(`${normalizedBaseUrl}/v1/upload`, {
          method: "POST",
          // The token is the credential; a cookie for this host would be neither
          // sent nor wanted.
          credentials: "omit",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
          signal: input.signal,
        });
      } catch (cause) {
        // A cancelled upload is not a failure the caller should surface.
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
        throw new StorageApiError(
          res.status,
          body?.code ?? res.statusText ?? "Upload failed",
          body?.code,
          { kind: res.ok ? "rejected" : classifyStorageStatus(res.status), retryAfterMs },
        );
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
        byteSize: typeof payload?.byteSize === "number" ? payload.byteSize : input.file.size,
        contentType:
          typeof payload?.contentType === "string"
            ? (payload.contentType as UploadContentType)
            : "image/webp",
      };
    },
  };
}
