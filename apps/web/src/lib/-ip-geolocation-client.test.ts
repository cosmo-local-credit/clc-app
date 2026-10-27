import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { regionFromLocale, resolveIPCamera, resolveIPCountry } from "./ip-geolocation-client";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv("VITE_MAPTILER_KEY", "test-key");
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("navigator", { languages: ["en-US"], language: "en-US" });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: () => Promise.resolve(body) } as Response;
}

function textResponse(body: string, ok = true) {
  return { ok, text: () => Promise.resolve(body) } as Response;
}

describe("resolveIPCamera", () => {
  it("returns a rank-3 city fix from MapTiler", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ latitude: -1.2921, longitude: 36.8219, city: "Nairobi", country_code: "KE" }),
    );

    const camera = await resolveIPCamera();

    expect(camera).toEqual({
      lat: -1.2921,
      lng: 36.8219,
      zoom: 11,
      source: "ip-city",
      country: "KE",
    });
    const requested = String(fetchMock.mock.calls[0]?.[0]);
    expect(requested).toContain("https://api.maptiler.com/geolocation/ip.json");
    expect(requested).toContain("key=test-key");
  });

  it("returns Global when MapTiler has no IP city", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));

    await expect(resolveIPCamera()).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("returns Global when MapTiler rejects", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("network down"));

    await expect(resolveIPCamera()).resolves.toBeNull();
  });

  it.each([
    ["a missing latitude", { longitude: 36.8 }],
    ["a non-numeric latitude", { latitude: "-1.29", longitude: 36.8 }],
    ["a non-finite latitude", { latitude: null, longitude: 36.8 }],
    ["an out-of-range latitude", { latitude: 91, longitude: 36.8 }],
    ["an out-of-range longitude", { latitude: -1.29, longitude: 181 }],
    ["an empty object", {}],
    ["a JSON array", []],
  ])("rejects %s from MapTiler", async (_label, body) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(body));

    await expect(resolveIPCamera()).resolves.toBeNull();
  });

  it("skips MapTiler entirely when no key is configured", async () => {
    vi.stubEnv("VITE_MAPTILER_KEY", "");
    await expect(resolveIPCamera()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null for Global discovery when every source fails", async () => {
    vi.stubGlobal("navigator", { languages: ["sw", "en"], language: "sw" });
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));

    await expect(resolveIPCamera()).resolves.toBeNull();
  });

  it("does not turn a browser language into a camera", async () => {
    vi.stubGlobal("navigator", { languages: ["fr", "ar"], language: "fr" });
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));

    await expect(resolveIPCamera()).resolves.toBeNull();
  });

  it("never throws, so it cannot block basemap rendering", async () => {
    vi.stubGlobal("navigator", { languages: ["fr"], language: "fr" });
    fetchMock.mockImplementation(() => {
      throw new Error("catastrophic");
    });

    await expect(resolveIPCamera()).resolves.toBeNull();
  });
});

describe("resolveIPCountry", () => {
  it("uses MapTiler's IP country even when its city coordinates are unavailable", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ country_code: "TZ" }));

    await expect(resolveIPCountry()).resolves.toBe("TZ");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("falls back to the Cloudflare IP country", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, false))
      .mockResolvedValueOnce(textResponse("loc=UG\n"));

    await expect(resolveIPCountry()).resolves.toBe("UG");
  });

  it("falls back to an explicit browser locale region", async () => {
    vi.stubGlobal("navigator", { languages: ["sw", "en-KE"], language: "sw" });
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, false))
      .mockResolvedValueOnce(textResponse("loc=XX\n"));

    await expect(resolveIPCountry()).resolves.toBe("KE");
  });

  it("does not infer a profile country from bare language preferences", async () => {
    vi.stubGlobal("navigator", { languages: ["fr", "ar"], language: "fr" });
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, false))
      .mockResolvedValueOnce(textResponse("loc=XX\n"));

    await expect(resolveIPCountry()).resolves.toBeNull();
  });
});

describe("device country hints", () => {
  it("uses only locale tags that explicitly name a region", () => {
    expect(regionFromLocale(["sw", "en-KE"])).toBe("KE");
    expect(regionFromLocale(["fr", "ar"])).toBeNull();
  });
});
