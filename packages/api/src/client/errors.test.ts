import { describe, expect, it } from "vite-plus/test";
import {
  BACKEND_CODE_KINDS,
  BackendApiError,
  NO_HTTP_STATUS,
  backendRetryDelayMs,
  classifyBackendError,
  formatBackendApiError,
  isRetryableBackendError,
  parseRetryAfterMs,
  retryTransientBackendRead,
  transientBackendReadRetryDelayMs,
} from "./errors";

describe("BackendApiError", () => {
  it("uses the description as the Error message so unhandled throws read usefully", () => {
    const err = new BackendApiError(500, "Internal Server Error");
    expect(err.message).toBe("Internal Server Error");
    expect(err.name).toBe("BackendApiError");
    expect(err).toBeInstanceOf(Error);
  });

  it("retains status and optional backend code, and classifies itself", () => {
    const err = new BackendApiError(403, "pending approval", "E10");
    expect(err.status).toBe(403);
    expect(err.code).toBe("E10");
    expect(err.kind).toBe("forbidden");
  });

  it("accepts an explicit kind for failures with no usable status", () => {
    const cause = new TypeError("Failed to fetch");
    const err = new BackendApiError(NO_HTTP_STATUS, "offline", undefined, {
      kind: "network",
      cause,
    });
    expect(err.kind).toBe("network");
    expect(err.cause).toBe(cause);
  });

  it("carries retryAfterMs when the backend supplied one", () => {
    expect(
      new BackendApiError(429, "slow down", undefined, { retryAfterMs: 3_000 }).retryAfterMs,
    ).toBe(3_000);
    expect(new BackendApiError(500, "boom").retryAfterMs).toBeUndefined();
  });
});

describe("classifyBackendError", () => {
  it.each([
    [401, undefined, "unauthenticated"],
    [403, undefined, "forbidden"],
    [404, undefined, "not-found"],
    [400, undefined, "validation"],
    [422, undefined, "validation"],
    [409, undefined, "conflict"],
    [429, undefined, "rate-limited"],
    [500, undefined, "server"],
    [503, undefined, "server"],
    [NO_HTTP_STATUS, undefined, "network"],
  ])("maps status %i to %s", (status, code, expected) => {
    expect(classifyBackendError(status, code)).toBe(expected);
  });

  it("lets a known backend code outrank the status", () => {
    // The backend returns E06 with assorted statuses; it always means the
    // session is gone.
    expect(classifyBackendError(500, "E06")).toBe("unauthenticated");
    expect(classifyBackendError(200, "E06")).toBe("unauthenticated");
    expect(classifyBackendError(409, "E17")).toBe("conflict");
    expect(classifyBackendError(200, "E17")).toBe("conflict");
  });

  it("treats an ok:false envelope with no known code as an application refusal", () => {
    expect(classifyBackendError(200)).toBe("application");
    expect(classifyBackendError(200, "E99")).toBe("application");
  });

  it("treats an unmapped 4xx as an application refusal, not validation", () => {
    // "validation" would imply the payload is fixable, which 405 or 418 does not.
    expect(classifyBackendError(405)).toBe("application");
    expect(classifyBackendError(418)).toBe("application");
  });

  it("documents its code mapping rather than hiding it", () => {
    expect(BACKEND_CODE_KINDS.E06).toBe("unauthenticated");
    expect(BACKEND_CODE_KINDS.E17).toBe("conflict");
  });
});

describe("isRetryableBackendError", () => {
  it("retries only transport failures and server faults", () => {
    expect(
      isRetryableBackendError(
        new BackendApiError(NO_HTTP_STATUS, "offline", undefined, { kind: "network" }),
      ),
    ).toBe(true);
    expect(isRetryableBackendError(new BackendApiError(503, "unavailable"))).toBe(true);
  });

  it("does not retry a failure a second identical attempt cannot fix", () => {
    for (const status of [400, 401, 403, 404, 409, 422]) {
      expect(isRetryableBackendError(new BackendApiError(status, "no"))).toBe(false);
    }
  });

  it("excludes rate limiting from automatic retry so Retry-After is respected", () => {
    // Replaying immediately is what got us rate limited.
    expect(isRetryableBackendError(new BackendApiError(429, "slow down"))).toBe(false);
  });

  it("does not retry a non-backend error, which comes from our own code", () => {
    expect(isRetryableBackendError(new Error("bug"))).toBe(false);
    expect(isRetryableBackendError(undefined)).toBe(false);
  });
});

describe("backendRetryDelayMs", () => {
  it("honours Retry-After over its own backoff", () => {
    const err = new BackendApiError(429, "slow down", undefined, { retryAfterMs: 7_500 });
    expect(backendRetryDelayMs(err, 0)).toBe(7_500);
    expect(backendRetryDelayMs(err, 3)).toBe(7_500);
  });

  it("backs off exponentially when the backend gave no interval", () => {
    const err = new BackendApiError(503, "unavailable");
    expect(backendRetryDelayMs(err, 0)).toBe(1_000);
    expect(backendRetryDelayMs(err, 1)).toBe(2_000);
    expect(backendRetryDelayMs(err, 2)).toBe(4_000);
  });
});

describe("transient backend read recovery", () => {
  it("retries network, rate-limit, and server failures at most twice", () => {
    const failures = [
      new BackendApiError(NO_HTTP_STATUS, "offline", undefined, { kind: "network" }),
      new BackendApiError(429, "slow down"),
      new BackendApiError(503, "unavailable"),
    ];
    for (const failure of failures) {
      expect(retryTransientBackendRead(0, failure)).toBe(true);
      expect(retryTransientBackendRead(1, failure)).toBe(true);
      expect(retryTransientBackendRead(2, failure)).toBe(false);
    }
  });

  it("does not retry caller, authentication, or local-code failures", () => {
    for (const status of [400, 401, 403, 404, 409, 422]) {
      expect(retryTransientBackendRead(0, new BackendApiError(status, "no"))).toBe(false);
    }
    expect(retryTransientBackendRead(0, new Error("bug"))).toBe(false);
  });

  it("honours Retry-After and adds bounded jitter to every delay", () => {
    const limited = new BackendApiError(429, "slow", undefined, { retryAfterMs: 7_500 });
    expect(transientBackendReadRetryDelayMs(limited, 0, () => 0.5)).toBe(7_625);
    expect(transientBackendReadRetryDelayMs(new BackendApiError(503, "busy"), 1, () => -1)).toBe(
      2_000,
    );
    expect(transientBackendReadRetryDelayMs(new BackendApiError(503, "busy"), 0, () => 2)).toBe(
      1_250,
    );
  });
});

describe("parseRetryAfterMs", () => {
  it("reads a seconds value", () => {
    expect(parseRetryAfterMs("120")).toBe(120_000);
    expect(parseRetryAfterMs("0")).toBe(0);
  });

  it("reads an HTTP date relative to the supplied clock", () => {
    const now = Date.parse("2026-01-01T00:00:00Z");
    expect(parseRetryAfterMs("Thu, 01 Jan 2026 00:00:30 GMT", now)).toBe(30_000);
  });

  it("clamps a date already in the past to zero", () => {
    const now = Date.parse("2026-01-01T00:01:00Z");
    expect(parseRetryAfterMs("Thu, 01 Jan 2026 00:00:00 GMT", now)).toBe(0);
  });

  it("returns undefined for a missing or unparseable header", () => {
    expect(parseRetryAfterMs(null)).toBeUndefined();
    expect(parseRetryAfterMs("")).toBeUndefined();
    expect(parseRetryAfterMs("   ")).toBeUndefined();
    expect(parseRetryAfterMs("soon")).toBeUndefined();
  });
});

describe("formatBackendApiError", () => {
  it("prefixes the backend code when there is one", () => {
    const err = new BackendApiError(403, "account is pending approval by a superadmin", "E10");
    expect(formatBackendApiError(err)).toBe("E10: account is pending approval by a superadmin");
  });

  it("returns the description alone when there is no code", () => {
    expect(formatBackendApiError(new BackendApiError(500, "Internal Server Error"))).toBe(
      "Internal Server Error",
    );
  });
});
