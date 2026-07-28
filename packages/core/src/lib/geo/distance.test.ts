import { describe, expect, it } from "vite-plus/test";

import { formatDistance, haversineMeters } from "./distance";

describe("haversineMeters", () => {
  it("measures one degree of latitude at the equator", () => {
    expect(haversineMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111_194.9, 0);
  });

  it("narrows longitude by latitude away from the equator", () => {
    // Belgrade to Novi Sad is ~72 km. Dropping the cos(lat) term yields ~87 km.
    const meters = haversineMeters({ lat: 44.7866, lng: 20.4489 }, { lat: 45.2671, lng: 19.8335 });
    expect(meters).toBeGreaterThan(71_000);
    expect(meters).toBeLessThan(73_000);
  });

  it("is symmetric and zero for identical points", () => {
    const nairobi = { lat: -1.2921, lng: 36.8219 };
    const mombasa = { lat: -4.0435, lng: 39.6682 };
    expect(haversineMeters(nairobi, nairobi)).toBe(0);
    expect(haversineMeters(nairobi, mombasa)).toBeCloseTo(haversineMeters(mombasa, nairobi), 6);
  });

  it.each([
    ["latitude above 90", { lat: 90.1, lng: 0 }],
    ["latitude below -90", { lat: -90.1, lng: 0 }],
    ["longitude above 180", { lat: 0, lng: 180.1 }],
    ["longitude below -180", { lat: 0, lng: -180.1 }],
    ["NaN latitude", { lat: Number.NaN, lng: 0 }],
    ["infinite longitude", { lat: 0, lng: Number.POSITIVE_INFINITY }],
  ])("throws RangeError for %s", (_label, invalid) => {
    expect(() => haversineMeters({ lat: 0, lng: 0 }, invalid)).toThrow(RangeError);
    expect(() => haversineMeters(invalid, { lat: 0, lng: 0 })).toThrow(RangeError);
  });
});

describe("formatDistance", () => {
  it("rounds below one kilometre to the nearest ten metres", () => {
    expect(formatDistance(0)).toEqual({ value: 0, unit: "m", fractionDigits: 0 });
    expect(formatDistance(4)).toEqual({ value: 0, unit: "m", fractionDigits: 0 });
    expect(formatDistance(154)).toEqual({ value: 150, unit: "m", fractionDigits: 0 });
    expect(formatDistance(155)).toEqual({ value: 160, unit: "m", fractionDigits: 0 });
    expect(formatDistance(999)).toEqual({ value: 1000, unit: "m", fractionDigits: 0 });
  });

  it("switches to one-decimal kilometres at exactly one kilometre", () => {
    expect(formatDistance(1_000)).toEqual({ value: 1, unit: "km", fractionDigits: 1 });
    expect(formatDistance(1_249)).toEqual({ value: 1.2, unit: "km", fractionDigits: 1 });
    expect(formatDistance(12_350)).toEqual({ value: 12.4, unit: "km", fractionDigits: 1 });
  });

  it("keeps one decimal at exactly one hundred kilometres", () => {
    expect(formatDistance(100_000)).toEqual({ value: 100, unit: "km", fractionDigits: 1 });
  });

  it("uses whole kilometres above one hundred kilometres", () => {
    expect(formatDistance(100_001)).toEqual({ value: 100, unit: "km", fractionDigits: 0 });
    expect(formatDistance(439_900)).toEqual({ value: 440, unit: "km", fractionDigits: 0 });
  });

  it.each([
    ["negative metres", -1],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
  ])("throws RangeError for %s", (_label, meters) => {
    expect(() => formatDistance(meters)).toThrow(RangeError);
  });
});
