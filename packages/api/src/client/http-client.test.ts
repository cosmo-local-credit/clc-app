import { describe, expect, it, vi } from "vite-plus/test";
import { BackendApiError } from "./errors";
import { createHttpClient } from "./http-client";

function response(status: number, body: string, statusText = ""): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    text: () => Promise.resolve(body),
  } as Response;
}

function clientWith(fetchImpl: typeof globalThis.fetch, baseUrl = "https://api.example.test") {
  return createHttpClient({ baseUrl, fetch: fetchImpl });
}

describe("createHttpClient base URL validation", () => {
  it("rejects a missing base URL at construction, not on first request", () => {
    // Failing at startup is the point: a deployment with no backend URL should
    // not get as far as issuing requests.
    expect(() => createHttpClient({ baseUrl: "" })).toThrow(/base URL is missing/);
    expect(() => createHttpClient({ baseUrl: "   " })).toThrow(/base URL is missing/);
  });

  it("rejects a relative or unparseable base URL", () => {
    expect(() => createHttpClient({ baseUrl: "/api" })).toThrow(/not a valid absolute URL/);
  });

  it("rejects a non-http protocol", () => {
    expect(() => createHttpClient({ baseUrl: "ftp://example.test" })).toThrow(/must be http/);
  });

  it("strips trailing slashes so resource paths do not double up", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200, "{}"));
    const client = clientWith(fetchImpl, "https://api.example.test/");
    expect(client.baseUrl).toBe("https://api.example.test");

    await client.request("/api/v2/pools");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.example.test/api/v2/pools",
      expect.anything(),
    );
  });
});

describe("createHttpClient requests", () => {
  it("uses the injected fetch rather than the global", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200, '{"ok":true,"result":{"a":1}}'));
    await clientWith(fetchImpl).request("/x");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("unwraps the ok envelope", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200, '{"ok":true,"result":{"a":1}}'));
    await expect(clientWith(fetchImpl).request("/x")).resolves.toEqual({ a: 1 });
  });

  it("returns an unenveloped body unchanged", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200, '{"a":1}'));
    await expect(clientWith(fetchImpl).request("/x")).resolves.toEqual({ a: 1 });
  });

  it("sends credentials and a JSON content type only when there is a body", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200, "{}"));
    const client = clientWith(fetchImpl);

    await client.request("/x", { method: "POST", body: "{}" });
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });

    await client.request("/y");
    expect(fetchImpl.mock.calls[1]?.[1]?.headers).toEqual({});
  });

  it("lets a caller override credentials for a public resource", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200, "{}"));
    await clientWith(fetchImpl).request("/x", { credentials: "omit" });
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ credentials: "omit" });
  });

  it("preserves an abort signal", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200, "{}"));
    const signal = new AbortController().signal;
    await clientWith(fetchImpl).request("/x", { signal });
    expect(fetchImpl.mock.calls[0]?.[1]?.signal).toBe(signal);
  });

  it("throws BackendApiError with the backend description and code on an HTTP error", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(response(403, '{"ok":false,"description":"pending","code":"E10"}'));

    const err = await clientWith(fetchImpl)
      .request("/x")
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BackendApiError);
    expect(err).toMatchObject({ status: 403, description: "pending", code: "E10" });
  });

  it("throws for a non-JSON body such as an HTML gateway page", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(502, "<html>oops</html>", "Bad Gateway"));
    const err = await clientWith(fetchImpl)
      .request("/x")
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BackendApiError);
    expect(err).toMatchObject({ status: 502, description: "Bad Gateway" });
  });

  it("throws for an application-layer ok:false envelope returned with HTTP 200", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(response(200, '{"ok":false,"description":"nonce used","code":"E22"}'));
    const err = await clientWith(fetchImpl)
      .request("/x")
      .catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 200, description: "nonce used", code: "E22" });
  });

  it("treats an empty body as a null result rather than a parse failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(204, ""));
    await expect(clientWith(fetchImpl).request("/x")).resolves.toBeNull();
  });
});

describe("platform fetch resolution", () => {
  it("resolves the global fetch per request, so a later replacement is honoured", async () => {
    // Constructed before any stub exists. Capturing globalThis.fetch here would
    // pin the wrong implementation for environments that patch fetch after
    // startup, and would silently bypass test doubles.
    const client = createHttpClient({ baseUrl: "https://api.example.test" });

    const first = vi.fn().mockResolvedValue(response(200, '{"n":1}'));
    vi.stubGlobal("fetch", first);
    await expect(client.request("/x")).resolves.toEqual({ n: 1 });

    const second = vi.fn().mockResolvedValue(response(200, '{"n":2}'));
    vi.stubGlobal("fetch", second);
    await expect(client.request("/x")).resolves.toEqual({ n: 2 });

    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it("prefers an explicitly injected fetch over the global", async () => {
    const injected = vi.fn().mockResolvedValue(response(200, '{"n":"injected"}'));
    const global = vi.fn().mockResolvedValue(response(200, '{"n":"global"}'));
    vi.stubGlobal("fetch", global);

    const client = createHttpClient({ baseUrl: "https://api.example.test", fetch: injected });
    await expect(client.request("/x")).resolves.toEqual({ n: "injected" });
    expect(global).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
