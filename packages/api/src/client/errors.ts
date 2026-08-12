/**
 * Backend failure type and its classification, shared by every resource module
 * and both apps.
 *
 * Owned by `client/` rather than by any one feature: an error raised while
 * fetching pools is not an auth concern, and the transport layer must be able to
 * throw it without importing from `features/`.
 *
 * `kind` exists so callers can branch on what went wrong rather than
 * re-deriving it from status codes at each call site. `status`, `description`
 * and `code` are unchanged, so existing consumers keep working.
 */

export type BackendErrorKind =
  /** The request never produced a response: offline, DNS, TLS, CORS, aborted socket. */
  | "network"
  /** A response arrived but was not intelligible as the documented contract. */
  | "protocol"
  | "unauthenticated"
  | "forbidden"
  | "not-found"
  | "validation"
  | "conflict"
  | "rate-limited"
  | "server"
  /** The backend refused the operation for its own reasons. */
  | "application";

/** No HTTP response was received, so there is no meaningful status. */
export const NO_HTTP_STATUS = 0;

/**
 * Backend codes whose meaning outranks the HTTP status.
 *
 * These already drive branching in apps/web; naming them here makes the mapping
 * explicit and keeps both apps agreeing on it.
 */
export const BACKEND_CODE_KINDS: Readonly<Record<string, BackendErrorKind>> = {
  /** JWT authentication failed / session expired. */
  E06: "unauthenticated",
  /** Email already belongs to a different identity. */
  E17: "conflict",
};

/**
 * Maps an HTTP status and optional backend code to a kind.
 *
 * A known backend code wins over the status: the backend returns `E06` with
 * assorted statuses, and it means the session is gone in every case. An envelope
 * failure arrives as HTTP 200 with `ok: false`, so status 200 means the backend
 * refused the operation rather than that it succeeded.
 */
export function classifyBackendError(status: number, code?: string): BackendErrorKind {
  const byCode = code ? BACKEND_CODE_KINDS[code] : undefined;
  if (byCode) return byCode;

  if (status === NO_HTTP_STATUS) return "network";
  if (status === 200) return "application";
  if (status === 401) return "unauthenticated";
  if (status === 403) return "forbidden";
  if (status === 404) return "not-found";
  if (status === 400 || status === 422) return "validation";
  if (status === 409) return "conflict";
  if (status === 429) return "rate-limited";
  if (status >= 500) return "server";

  // Any other 4xx is a request the backend rejected for a reason it has not
  // given a dedicated status. Deliberately not "validation", which would imply
  // the payload is fixable.
  return "application";
}

export type BackendApiErrorOptions = {
  /** Overrides classification. Used for failures with no usable HTTP status. */
  kind?: BackendErrorKind;
  /** From `Retry-After`, when the backend said how long to wait. */
  retryAfterMs?: number;
  cause?: unknown;
};

export class BackendApiError extends Error {
  readonly kind: BackendErrorKind;
  readonly retryAfterMs?: number;

  constructor(
    public readonly status: number,
    public readonly description: string,
    public readonly code?: string,
    options: BackendApiErrorOptions = {},
  ) {
    super(description, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "BackendApiError";
    this.kind = options.kind ?? classifyBackendError(status, code);
    this.retryAfterMs = options.retryAfterMs;
  }
}

export function formatBackendApiError(err: BackendApiError): string {
  return err.code ? `${err.code}: ${err.description}` : err.description;
}

/**
 * Whether an automatic retry is worth attempting.
 *
 * Only transport failures and server faults qualify — they are the ones a second
 * identical attempt can plausibly resolve. Retrying `validation`, `forbidden` or
 * `not-found` just multiplies the same failure, and `rate-limited` must wait for
 * the interval the backend named rather than replaying immediately, so it is
 * excluded from automatic retry and left to callers that can honour the delay.
 *
 * A non-BackendApiError is not retried: it comes from our own code, not the
 * network, so it will fail the same way again.
 */
export function isRetryableBackendError(error: unknown): boolean {
  if (!(error instanceof BackendApiError)) return false;
  return error.kind === "network" || error.kind === "server";
}

/**
 * Delay before the given retry attempt, honouring `Retry-After` when present.
 *
 * `attempt` is zero-based, so the first retry waits the base delay.
 */
export function backendRetryDelayMs(error: unknown, attempt: number, baseMs = 1_000): number {
  if (error instanceof BackendApiError && error.retryAfterMs !== undefined) {
    return error.retryAfterMs;
  }
  return baseMs * 2 ** Math.max(0, attempt);
}

/**
 * Parses a `Retry-After` header, which may be seconds or an HTTP date.
 *
 * `now` is injectable because a date-form header is relative to the current
 * clock, and a test that cannot fix "now" cannot assert the result.
 */
export function parseRetryAfterMs(
  headerValue: string | null,
  now = Date.now(),
): number | undefined {
  if (!headerValue) return undefined;
  const trimmed = headerValue.trim();
  if (!trimmed) return undefined;

  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed) * 1_000;
  }

  const at = Date.parse(trimmed);
  if (Number.isNaN(at)) return undefined;
  return Math.max(0, at - now);
}
