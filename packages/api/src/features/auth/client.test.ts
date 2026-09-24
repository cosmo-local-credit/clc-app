import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createHttpClient } from "../../client/http-client";
import { createAuthClient } from "./client";

import { BackendApiError } from "../../client/errors";

// One client over a test base URL. `fetch` is left to the platform so the
// existing vi.stubGlobal("fetch") in each test is what answers the request.
const api = createAuthClient(createHttpClient({ baseUrl: "https://api.test" }));

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

describe("http transport — error handling", () => {
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

    await expect(api.getSiweNonce()).rejects.toMatchObject({
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

    const err = await api.getSiweNonce().catch((e: unknown) => e);
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

    const err = await api.getSiweNonce().catch((e: unknown) => e);
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

    const err = await api.getSiweNonce().catch((e: unknown) => e);
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

    const nonce = await api.getSiweNonce();
    expect(nonce).toBe("abc123");
  });
});

describe("getSession", () => {
  it("returns null for 204 no-session responses", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        status: 204,
        ok: true,
      }),
    );

    await expect(api.getSession()).resolves.toBeNull();
  });

  it("returns the bare session body", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        status: 200,
        body: { address: "0x1234567890123456789012345678901234567890", chainId: 42220 },
      }),
    );

    await expect(api.getSession()).resolves.toEqual({
      address: "0x1234567890123456789012345678901234567890",
      chainId: 42220,
    });
  });
});

describe("getWebAuthnCredentials", () => {
  it("GETs the session-scoped credential list and unwraps the envelope", async () => {
    const result = {
      address: "0x1234567890123456789012345678901234567890",
      credentials: [
        {
          credentialId: "cred-1",
          state: "pending",
          createdAt: "2026-09-24T00:00:00Z",
          trackingId: "t-1",
        },
      ],
    };
    const fetchMock = mockFetch({ status: 200, body: { ok: true, result } });
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.getWebAuthnCredentials()).resolves.toEqual(result);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.test/auth/webauthn/credentials",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("surfaces a missing session as unauthenticated rather than an empty list", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        status: 401,
        body: { ok: false, code: "E06", description: "a user session is required" },
      }),
    );

    await expect(api.getWebAuthnCredentials()).rejects.toMatchObject({ kind: "unauthenticated" });
  });
});

describe("signinWithWebAuthn", () => {
  const assertion = {
    credentialId: "cred-1",
    authenticatorData: "ad",
    clientDataJSON: "cdj",
    signature: "sig",
  };

  it("POSTs the assertion to /auth/webauthn/verify and returns the result", async () => {
    const fetchMock = mockFetch({
      status: 200,
      body: {
        ok: true,
        result: {
          userId: 7,
          role: "USER",
          address: "0xabc",
          keyHash: "0xkey",
          publicKeyX: "1",
          publicKeyY: "2",
        },
      },
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.signinWithWebAuthn(assertion)).resolves.toMatchObject({
      userId: 7,
      address: "0xabc",
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/auth/webauthn/verify");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(init.body as string)).toEqual(assertion);
  });

  it("throws BackendApiError(404) when the address is not registered", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        status: 404,
        body: { ok: false, description: "address not registered", code: "E03" },
        ok: false,
      }),
    );

    await expect(api.signinWithWebAuthn(assertion)).rejects.toMatchObject({
      name: "BackendApiError",
      status: 404,
    });
  });

  it("throws BackendApiError(403) for pending/rejected accounts", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        status: 403,
        body: { ok: false, description: "account is pending approval", code: "E10" },
        ok: false,
      }),
    );

    await expect(api.signinWithWebAuthn(assertion)).rejects.toMatchObject({
      name: "BackendApiError",
      status: 403,
    });
  });
});

describe("waitForTrackingCompletion", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("polls until the tracking chain reaches SUCCESS", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: "",
          text: () =>
            Promise.resolve(
              JSON.stringify({
                ok: true,
                result: {
                  otx: [
                    {
                      id: 1,
                      trackingId: "uuid-1",
                      otxType: "RELAY_DELEGATE",
                      txHash: "0xabc",
                      nonce: 0,
                      replaced: false,
                      createdAt: "2026-06-18T00:00:00Z",
                      status: "IN_NETWORK",
                    },
                  ],
                },
              }),
            ),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: "",
          text: () =>
            Promise.resolve(
              JSON.stringify({
                ok: true,
                result: {
                  otx: [
                    {
                      id: 1,
                      trackingId: "uuid-1",
                      otxType: "RELAY_DELEGATE",
                      txHash: "0xabc",
                      nonce: 0,
                      replaced: false,
                      createdAt: "2026-06-18T00:00:00Z",
                      status: "SUCCESS",
                    },
                  ],
                },
              }),
            ),
        }),
    );

    const promise = api.waitForTrackingCompletion("uuid-1", { timeoutMs: 5_000, pollMs: 500 });
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toMatchObject({
      trackingId: "uuid-1",
      txHash: "0xabc",
      status: "SUCCESS",
    });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v2/otx/track/uuid-1"),
      expect.objectContaining({ credentials: "include", method: "GET" }),
    );
  });

  it("throws when the latest active OTX reaches a terminal failure status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "",
        text: () =>
          Promise.resolve(
            JSON.stringify({
              ok: true,
              result: {
                otx: [
                  {
                    id: 1,
                    trackingId: "uuid-1",
                    otxType: "RELAY_DELEGATE",
                    txHash: "0xabc",
                    nonce: 0,
                    replaced: false,
                    createdAt: "2026-06-18T00:00:00Z",
                    status: "NO_GAS",
                  },
                ],
              },
            }),
          ),
      }),
    );

    await expect(
      api.waitForTrackingCompletion("uuid-1", { timeoutMs: 5_000, pollMs: 500 }),
    ).rejects.toThrow("Transaction failed on-chain (NO_GAS).");
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

    const result = await api.signupWithSiwe({
      message: "msg",
      signature: "0xsig",
      name: "Alice",
      email: "alice@example.com",
    });

    expect(result.alreadyRegistered).toBe(true);
    expect(result.status).toBe("REGISTERED");
  });

  it("re-throws a 409 with code E17 (email conflict) instead of swallowing it", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        status: 409,
        statusText: "Conflict",
        body: { ok: false, description: "email already linked to another account", code: "E17" },
        ok: false,
      }),
    );

    await expect(
      api.signupWithSiwe({
        message: "msg",
        signature: "0xsig",
        name: "Alice",
        email: "alice@example.com",
      }),
    ).rejects.toMatchObject({ status: 409, code: "E17" });
  });

  it("discards the session cookie when detached", async () => {
    const fetchMock = mockFetch({
      body: { ok: true, result: { userId: 1, status: "APPROVED", role: "USER" } },
    });
    vi.stubGlobal("fetch", fetchMock);

    await api.signupWithSiwe(
      { message: "msg", signature: "0xsig", name: "Alice", email: "alice@example.com" },
      { detached: true },
    );

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ credentials: "omit" });
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
      api.signupWithSiwe({
        message: "msg",
        signature: "0xsig",
        name: "Alice",
        email: "alice@example.com",
      }),
    ).rejects.toBeInstanceOf(BackendApiError);
  });
});

describe("submitProfile — avatar", () => {
  it("serializes profile preferences when supplied", async () => {
    const fetchMock = mockFetch({ body: { ok: true, result: { address: "0xabc" } } });
    vi.stubGlobal("fetch", fetchMock);

    await api.submitProfile({
      name: "N",
      email: "e@example.com",
      phone: "",
      country: "KE",
      preferredCurrency: "KES",
      bio: "Neighbourhood organiser",
      website: "https://example.com",
    });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toMatchObject({
      preferredCurrency: "KES",
      bio: "Neighbourhood organiser",
      website: "https://example.com",
    });
  });

  it("omits avatarUrl entirely when the caller says nothing about it", async () => {
    const fetchMock = mockFetch({ body: { ok: true, result: { address: "0xabc" } } });
    vi.stubGlobal("fetch", fetchMock);

    await api.submitProfile({ name: "N", email: "e@example.com", phone: "", country: "KE" });

    const sent = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect("avatarUrl" in sent).toBe(false);
  });

  it("sends clearAvatar for null, not JSON null", async () => {
    const fetchMock = mockFetch({ body: { ok: true, result: { address: "0xabc" } } });
    vi.stubGlobal("fetch", fetchMock);

    await api.submitProfile({
      name: "N",
      email: "e@example.com",
      phone: "",
      country: "KE",
      avatarUrl: null,
    });

    // clc-core decodes JSON null to the same nil pointer as an absent key, and nil
    // preserves. Sending null would silently leave the avatar in place.
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(sent.clearAvatar).toBe(true);
    expect("avatarUrl" in sent).toBe(false);
  });

  it("returns the saved row so a caller can seed the profile query", async () => {
    const saved = { address: "0xabc", name: "N", email: "e@example.com", phone: "", country: "KE" };
    vi.stubGlobal("fetch", mockFetch({ body: { ok: true, result: saved } }));

    await expect(
      api.submitProfile({ name: "N", email: "e@example.com", phone: "", country: "KE" }),
    ).resolves.toEqual(saved);
  });
});
