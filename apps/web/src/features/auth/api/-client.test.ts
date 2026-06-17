import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { BackendApiError, getSiweNonce, signupWithSiwe } from "./client";

function mockFetch(options: {
  status?: number;
  statusText?: string;
  body?: unknown;
  text?: string;
  ok?: boolean;
}) {
  const status = options.status ?? 200;
  const ok = options.ok ?? status < 400;
  const text =
    options.text !== undefined
      ? options.text
      : options.body !== undefined
        ? JSON.stringify(options.body)
        : "";

  return vi.fn().mockResolvedValue({
    ok,
    status,
    statusText: options.statusText ?? "",
    text: () => Promise.resolve(text),
    json: () => Promise.resolve(options.body),
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("apiFetch — error handling", () => {
  it("throws BackendApiError with status and description from error body on !res.ok", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        status: 401,
        statusText: "Unauthorized",
        body: { ok: false, description: "Invalid credentials", code: "AUTH_001" },
        ok: false,
      }),
    );

    await expect(getSiweNonce()).rejects.toMatchObject({
      name: "BackendApiError",
      status: 401,
      description: "Invalid credentials",
      code: "AUTH_001",
    });
  });

  it("throws BackendApiError when response body is not JSON (e.g. 502 HTML)", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        status: 502,
        statusText: "Bad Gateway",
        text: "<html><body>Bad Gateway</body></html>",
        ok: false,
      }),
    );

    const err = await getSiweNonce().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BackendApiError);
    expect((err as BackendApiError).status).toBe(502);
    // Non-JSON body: description comes from statusText fallback
    expect((err as BackendApiError).description).toBe("Bad Gateway");
  });

  it("falls back to statusText when error body has no description", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        status: 500,
        statusText: "Internal Server Error",
        body: { ok: false },
        ok: false,
      }),
    );

    const err = await getSiweNonce().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BackendApiError);
    expect((err as BackendApiError).description).toBe("Internal Server Error");
  });

  it("throws BackendApiError(200) for application-layer ok=false envelope", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        status: 200,
        body: { ok: false, description: "nonce exhausted", code: "NONCE_USED" },
      }),
    );

    const err = await getSiweNonce().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BackendApiError);
    expect((err as BackendApiError).status).toBe(200);
    expect((err as BackendApiError).description).toBe("nonce exhausted");
    expect((err as BackendApiError).code).toBe("NONCE_USED");
  });

  it("returns result from ok=true envelope", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        status: 200,
        body: { ok: true, result: { nonce: "abc123" } },
      }),
    );

    const nonce = await getSiweNonce();
    expect(nonce).toBe("abc123");
  });
});

describe("signupWithSiwe — 409 swallow", () => {
  it("returns alreadyRegistered:true on 409 instead of throwing", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        status: 409,
        statusText: "Conflict",
        body: { ok: false, description: "User already registered" },
        ok: false,
      }),
    );

    const result = await signupWithSiwe({
      message: "msg",
      signature: "0xsig",
      name: "Alice",
      email: "alice@example.com",
    });

    expect(result.alreadyRegistered).toBe(true);
    expect(result.status).toBe("REGISTERED");
  });

  it("re-throws non-409 errors from signupWithSiwe", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        status: 500,
        statusText: "Internal Server Error",
        body: { ok: false, description: "Server exploded" },
        ok: false,
      }),
    );

    await expect(
      signupWithSiwe({
        message: "msg",
        signature: "0xsig",
        name: "Alice",
        email: "alice@example.com",
      }),
    ).rejects.toBeInstanceOf(BackendApiError);
  });
});
