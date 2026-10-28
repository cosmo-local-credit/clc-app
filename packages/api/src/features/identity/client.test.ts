import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createHttpClient } from "../../client/http-client";
import { createIdentityClient } from "./client";

const api = createIdentityClient(createHttpClient({ baseUrl: "https://api.test" }));

function response(result: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: "",
    text: () => Promise.resolve(JSON.stringify({ ok: true, description: "test", result })),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("identity client", () => {
  it("sends only the identities it was given, folded the way signup stores them", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        email: { available: false },
        username: { available: true },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      api.getAvailability({
        email: "  Zqavail-Aude@Example.Test ",
        username: "  Aude-Péronne ",
      }),
    ).resolves.toEqual({
      email: { available: false },
      phone: undefined,
      username: { available: true },
    });

    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain("email=zqavail-aude%40example.test");
    expect(url).toContain(`username=${encodeURIComponent("Aude-Péronne")}`);
    expect(url).not.toContain("phone=");
  });

  it("reads an unusable answer as available", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ email: {} })));
    await expect(api.getAvailability({ email: "a@example.com" })).resolves.toEqual({
      email: { available: true },
      phone: undefined,
      username: undefined,
    });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ phone: { available: "no" } })));
    await expect(api.getAvailability({ phone: "+254700009184" })).resolves.toMatchObject({
      phone: { available: true },
    });
  });

  it("refuses to ask when every identity is blank", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(api.getAvailability({ email: "  ", username: "" })).rejects.toThrow(
      "An email, phone, or username to check is required.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
