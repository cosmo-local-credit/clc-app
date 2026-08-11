/**
 * The single transport for every clc-core request.
 *
 * Configured once by the app that owns it and passed to each resource module, so
 * nothing in this package reads `import.meta.env` or mutates a global. That makes
 * resource modules testable by handing them a stub `fetch` instead of patching
 * `globalThis`, and makes a misconfigured deployment fail at startup rather than
 * one request at a time.
 */

import { BackendApiError } from "./errors";

type ApiOk<T> = {
  ok: true;
  description?: string;
  result: T;
};

type ApiErr = {
  ok: false;
  description?: string;
  code?: string;
};

export type HttpClient = {
  /** Issues a request and unwraps the backend's `{ ok, result }` envelope. */
  request<T>(path: string, init?: RequestInit): Promise<T>;
  /** The normalized base URL, for diagnostics and tests. */
  readonly baseUrl: string;
};

export type CreateHttpClientOptions = {
  /**
   * Absolute backend origin, optionally with a path prefix. Required — an empty
   * value throws rather than silently falling back, because a base URL guessed
   * in production sends every request somewhere wrong.
   */
  baseUrl: string;
  /**
   * Injectable for tests. When omitted, the platform `fetch` is resolved on each
   * request rather than captured here, so a `fetch` replaced after startup —
   * a test double, a mock service worker — is still honoured.
   */
  fetch?: typeof globalThis.fetch;
};

export function createHttpClient({
  baseUrl,
  fetch: fetchImpl,
}: CreateHttpClientOptions): HttpClient {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const doFetch: typeof globalThis.fetch = fetchImpl ?? ((...args) => globalThis.fetch(...args));

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers: Record<string, string> = {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers as Record<string, string> | undefined),
    };

    const res = await doFetch(`${normalizedBaseUrl}${path}`, {
      credentials: "include",
      ...init,
      headers,
    });

    const text = await res.text();
    let body: ApiOk<T> | ApiErr | T | null = null;
    if (text) {
      try {
        body = JSON.parse(text) as ApiOk<T> | ApiErr | T;
      } catch {
        throw new BackendApiError(res.status, res.statusText || "Non-JSON response from server");
      }
    }

    if (!res.ok) {
      const errBody = body as ApiErr | null;
      throw new BackendApiError(
        res.status,
        errBody?.description ?? (res.statusText || "Request failed"),
        errBody?.code,
      );
    }

    if (body && typeof body === "object" && "ok" in body) {
      const envelope = body as ApiOk<T> | ApiErr;
      if (!envelope.ok) {
        throw new BackendApiError(200, envelope.description ?? "Request failed", envelope.code);
      }
      return envelope.result;
    }

    return body as T;
  }

  return { request, baseUrl: normalizedBaseUrl };
}

/**
 * Validates the configured origin once, at startup.
 *
 * A trailing slash is dropped so callers can pass resource paths beginning with
 * `/` without producing a double slash.
 */
function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl?.trim() ?? "";
  if (!trimmed) {
    throw new Error(
      "clc-core base URL is missing. Pass a VITE_API_URL-derived value to createClcApi; " +
        "a build with no backend URL would send every request to the wrong place.",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`clc-core base URL is not a valid absolute URL: ${trimmed}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`clc-core base URL must be http or https, received: ${parsed.protocol}`);
  }

  return trimmed.replace(/\/+$/, "");
}
