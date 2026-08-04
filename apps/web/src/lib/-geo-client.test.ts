import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { reverseLocation, searchLocations } from "./geo-client";

function mockFetch(body: unknown, status = 200) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

beforeEach(() => {
  vi.stubEnv("VITE_MAPTILER_KEY", "maptiler-test-key");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("searchLocations", () => {
  it("returns an empty list for queries shorter than 3 characters without calling fetch", async () => {
    const spy = vi.spyOn(globalThis, "fetch");

    await expect(searchLocations("ab")).resolves.toEqual([]);
    await expect(searchLocations("  a")).resolves.toEqual([]);
    await expect(searchLocations("")).resolves.toEqual([]);

    expect(spy).not.toHaveBeenCalled();
  });

  it("returns an empty list when the signal is already aborted", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const controller = new AbortController();
    controller.abort();

    await expect(searchLocations("Nairobi CBD", controller.signal)).resolves.toEqual([]);

    expect(spy).not.toHaveBeenCalled();
  });

  it("uses the MapTiler place name without duplicating country text", async () => {
    mockFetch({
      features: [
        {
          center: [36.8219, -1.2921],
          place_name: "Nairobi, Kenya",
          relevance: 0.99,
          properties: { country_code: "ke" },
        },
      ],
    });

    const result = await searchLocations("Nairobi");

    expect(result[0]?.address).toBe("Nairobi, Kenya");
  });

  it("GETs MapTiler forward geocoding with an encoded query and abort signal", async () => {
    const signal = new AbortController().signal;
    const spy = mockFetch({
      features: [
        {
          center: [36.8219, -1.2921],
          place_name: "Nairobi, Kenya",
          relevance: 0.99,
          properties: { country_code: "ke" },
        },
      ],
    });

    const result = await searchLocations("Nairobi CBD", signal);

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("https://api.maptiler.com/geocoding/Nairobi%20CBD.json?"),
      expect.objectContaining({ method: "GET", signal }),
    );
    const request = spy.mock.calls[0]?.[0];
    expect(request).toEqual(expect.any(String));
    if (typeof request !== "string") throw new Error("Expected fetch to receive a URL string.");
    const url = new URL(request);
    expect(url.searchParams.get("language")).toBe("en");
    expect(url.searchParams.get("autocomplete")).toBe("true");
    expect(url.searchParams.get("limit")).toBe("5");
    expect(url.searchParams.get("key")).toBe("maptiler-test-key");
    expect(result).toEqual([
      {
        address: "Nairobi, Kenya",
        lat: -1.2921,
        lng: 36.8219,
        score: 99,
        country: "KE",
      },
    ]);
  });

  it("reads a country code from feature context", async () => {
    mockFetch({
      features: [
        {
          center: [36.8219, -1.2921],
          text: "Nairobi",
          relevance: 0.95,
          context: [{ country_code: "ke" }],
        },
      ],
    });

    await expect(searchLocations("Nairobi")).resolves.toEqual([
      {
        address: "Nairobi",
        lat: -1.2921,
        lng: 36.8219,
        score: 95,
        country: "KE",
      },
    ]);
  });

  it("returns an empty list when search fails", async () => {
    mockFetch({ error: { message: "provider failed" } }, 502);
    await expect(searchLocations("Nairobi")).resolves.toEqual([]);
  });

  it("does not geocode without a MapTiler key", async () => {
    vi.stubEnv("VITE_MAPTILER_KEY", "");
    const spy = vi.spyOn(globalThis, "fetch");

    await expect(searchLocations("Nairobi")).resolves.toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("reverseLocation", () => {
  it("GETs MapTiler reverse geocoding and normalizes its country code", async () => {
    const signal = new AbortController().signal;
    const spy = mockFetch({
      features: [
        {
          place_name: "Mathira, Nyeri, Kenya",
          properties: { country_code: "ke" },
        },
      ],
    });

    const result = await reverseLocation(-0.3976733984248142, 37.05733357847967, signal);

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining(
        "https://api.maptiler.com/geocoding/37.05733357847967,-0.3976733984248142.json?",
      ),
      expect.objectContaining({ method: "GET", signal }),
    );
    const request = spy.mock.calls[0]?.[0];
    expect(request).toEqual(expect.any(String));
    if (typeof request !== "string") throw new Error("Expected fetch to receive a URL string.");
    const url = new URL(request);
    expect(url.searchParams.get("language")).toBe("en");
    expect(url.searchParams.get("limit")).toBe("1");
    expect(url.searchParams.get("key")).toBe("maptiler-test-key");
    expect(result).toEqual({
      locationName: "Mathira, Nyeri, Kenya",
      country: "KE",
    });
  });

  it("returns null when no country is identified", async () => {
    mockFetch({ features: [{ place_name: "Atlantic Ocean" }] });
    await expect(reverseLocation(0, 0)).resolves.toBeNull();
  });

  it("returns null when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(reverseLocation(-1.2921, 36.8219, controller.signal)).resolves.toBeNull();
  });

  it("returns null when the country code is invalid", async () => {
    mockFetch({
      features: [
        {
          place_name: "Somewhere",
          properties: { country_code: "zzz" },
        },
      ],
    });

    await expect(reverseLocation(0, 0)).resolves.toBeNull();
  });

  it("does not reverse geocode without a MapTiler key", async () => {
    vi.stubEnv("VITE_MAPTILER_KEY", "");
    const spy = vi.spyOn(globalThis, "fetch");

    await expect(reverseLocation(-1.2921, 36.8219)).resolves.toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});
