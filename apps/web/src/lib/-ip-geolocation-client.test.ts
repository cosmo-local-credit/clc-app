import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { NAIROBI_DEFAULT_CAMERA, resolveIPCamera } from "./ip-geolocation-client";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv("VITE_MAPTILER_KEY", "test-key");
  vi.stubEnv("VITE_DEFAULT_COUNTRY", "KE");
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
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

    expect(camera).toEqual({ lat: -1.2921, lng: 36.8219, zoom: 11, source: "ip-city" });
    const requested = String(fetchMock.mock.calls[0]?.[0]);
    expect(requested).toContain("https://api.maptiler.com/geolocation/ip.json");
    expect(requested).toContain("key=test-key");
  });

  it("falls through to Cloudflare when MapTiler returns non-OK", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, false))
      .mockResolvedValueOnce(textResponse("fl=abc\nloc=RS\nvisit_scheme=https\n"));

    const camera = await resolveIPCamera();

    // A country result is a rank-4 default, never a rank-3 city fix.
    expect(camera.source).toBe("country-default");
    expect(camera.zoom).toBe(12);
    // Belgrade.
    expect(camera.lat).toBeCloseTo(44.7866, 3);
    expect(camera.lng).toBeCloseTo(20.4489, 3);
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe("/cdn-cgi/trace");
  });

  it("falls through to Cloudflare when MapTiler rejects", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("network down"))
      .mockResolvedValueOnce(textResponse("loc=TZ\n"));

    const camera = await resolveIPCamera();

    expect(camera.source).toBe("country-default");
    // Dar es Salaam, not Nairobi.
    expect(camera.lat).toBeCloseTo(-6.7924, 3);
  });

  it.each([
    ["a missing latitude", { longitude: 36.8 }],
    ["a non-numeric latitude", { latitude: "-1.29", longitude: 36.8 }],
    ["a non-finite latitude", { latitude: null, longitude: 36.8 }],
    ["an out-of-range latitude", { latitude: 91, longitude: 36.8 }],
    ["an out-of-range longitude", { latitude: -1.29, longitude: 181 }],
    ["an empty object", {}],
    ["a JSON array", []],
  ])("rejects %s from MapTiler and falls through", async (_label, body) => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(body))
      .mockResolvedValueOnce(textResponse("loc=RS\n"));

    const camera = await resolveIPCamera();

    expect(camera.source).toBe("country-default");
  });

  it("skips MapTiler entirely when no key is configured", async () => {
    vi.stubEnv("VITE_MAPTILER_KEY", "");
    fetchMock.mockResolvedValueOnce(textResponse("loc=RS\n"));

    const camera = await resolveIPCamera();

    expect(camera.source).toBe("country-default");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/cdn-cgi/trace");
  });

  it("uses VITE_DEFAULT_COUNTRY when Cloudflare has no usable loc", async () => {
    vi.stubEnv("VITE_DEFAULT_COUNTRY", "RS");
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, false))
      .mockResolvedValueOnce(textResponse("fl=abc\nvisit_scheme=https\n"));

    const camera = await resolveIPCamera();

    expect(camera.source).toBe("country-default");
    expect(camera.lat).toBeCloseTo(44.7866, 3);
  });

  it("ignores an XX loc placeholder and uses the configured country", async () => {
    vi.stubEnv("VITE_DEFAULT_COUNTRY", "RS");
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, false))
      .mockResolvedValueOnce(textResponse("loc=XX\n"));

    const camera = await resolveIPCamera();

    expect(camera.lat).toBeCloseTo(44.7866, 3);
  });

  it("ends at Nairobi when every source fails", async () => {
    vi.stubEnv("VITE_DEFAULT_COUNTRY", "");
    fetchMock
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockRejectedValueOnce(new TypeError("offline"));

    await expect(resolveIPCamera()).resolves.toEqual(NAIROBI_DEFAULT_CAMERA);
  });

  it("ends at Nairobi for an unrecognised country code", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, false))
      .mockResolvedValueOnce(textResponse("loc=ZZ\n"));

    await expect(resolveIPCamera()).resolves.toEqual(NAIROBI_DEFAULT_CAMERA);
  });

  it("never throws, so it cannot block basemap rendering", async () => {
    fetchMock.mockImplementation(() => {
      throw new Error("catastrophic");
    });

    await expect(resolveIPCamera()).resolves.toEqual(NAIROBI_DEFAULT_CAMERA);
  });
});
