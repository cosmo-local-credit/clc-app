import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { reverseLocation, searchLocations } from "./geo-client";

function mockFetch(body: unknown, status = 200) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
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

  it("deduplicates country name already present in Match_addr", async () => {
    mockFetch({
      candidates: [
        {
          address: "Nairobi, Kenya",
          location: { x: 36.8219, y: -1.2921 },
          score: 99,
          attributes: {
            Match_addr: "Nairobi, Kenya",
            Country: "KE",
            CntryName: "Kenya",
          },
        },
      ],
    });

    const result = await searchLocations("Nairobi");

    expect(result[0]?.address).toBe("Nairobi, Kenya");
  });

  it("GETs ArcGIS findAddressCandidates with an encoded query and abort signal", async () => {
    const signal = new AbortController().signal;
    const spy = mockFetch({
      candidates: [
        {
          address: "Nairobi",
          location: { x: 36.8219, y: -1.2921 },
          score: 99,
          attributes: {
            Match_addr: "Nairobi",
            Country: "KEN",
            CntryName: "Kenya",
          },
        },
      ],
    });

    const result = await searchLocations("Nairobi CBD", signal);

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining(
        "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?",
      ),
      expect.objectContaining({ method: "GET", signal }),
    );
    const url = new URL(String(spy.mock.calls[0]?.[0]));
    expect(url.searchParams.get("SingleLine")).toBe("Nairobi CBD");
    expect(url.searchParams.get("f")).toBe("json");
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

  it("returns an empty list when search fails", async () => {
    mockFetch({ error: { message: "provider failed" } }, 502);
    await expect(searchLocations("Nairobi")).resolves.toEqual([]);
  });
});

describe("reverseLocation", () => {
  it("GETs ArcGIS reverseGeocode and normalizes the ISO-3 country code", async () => {
    const signal = new AbortController().signal;
    const spy = mockFetch({
      address: {
        Match_addr: "Mathira, Nyeri",
        CountryCode: "KEN",
        CntryName: "Kenya",
      },
    });

    const result = await reverseLocation(-0.3976733984248142, 37.05733357847967, signal);

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining(
        "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode?",
      ),
      expect.objectContaining({ method: "GET", signal }),
    );
    const url = new URL(String(spy.mock.calls[0]?.[0]));
    expect(url.searchParams.get("location")).toBe("37.05733357847967,-0.3976733984248142");
    expect(url.searchParams.get("f")).toBe("json");
    expect(result).toEqual({
      locationName: "Mathira, Nyeri, Kenya",
      country: "KE",
    });
  });

  it("returns null when no country is identified", async () => {
    mockFetch({ address: { Match_addr: "Atlantic Ocean" } });
    await expect(reverseLocation(0, 0)).resolves.toBeNull();
  });

  it("returns null when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(reverseLocation(-1.2921, 36.8219, controller.signal)).resolves.toBeNull();
  });

  it("returns null when the ISO-3 country code is not recognized", async () => {
    mockFetch({
      address: {
        Match_addr: "Somewhere",
        CountryCode: "ZZZ",
        CntryName: "Unknown",
      },
    });

    await expect(reverseLocation(0, 0)).resolves.toBeNull();
  });
});
