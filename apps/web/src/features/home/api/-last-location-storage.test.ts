import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  clearPersistedLocation,
  readPersistedLocation,
  writePersistedLocation,
} from "./last-location-storage";

const STORAGE_KEY = "clc_last_location_v1";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("persisted location storage", () => {
  it("round-trips a real GPS fix", () => {
    writePersistedLocation({
      lat: -1.2921,
      lng: 36.8219,
      accuracy: 12.5,
      capturedAt: "2026-07-26T08:00:00.000Z",
    });

    expect(readPersistedLocation()).toEqual({
      lat: -1.2921,
      lng: 36.8219,
      accuracy: 12.5,
      capturedAt: "2026-07-26T08:00:00.000Z",
    });
  });

  it("uses the versioned storage key", () => {
    writePersistedLocation({
      lat: 0,
      lng: 0,
      accuracy: 1,
      capturedAt: "2026-07-26T08:00:00.000Z",
    });

    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it("returns null when nothing is stored", () => {
    expect(readPersistedLocation()).toBeNull();
  });

  it("clears the stored fix", () => {
    writePersistedLocation({
      lat: -1.2921,
      lng: 36.8219,
      accuracy: 12.5,
      capturedAt: "2026-07-26T08:00:00.000Z",
    });

    clearPersistedLocation();

    expect(readPersistedLocation()).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("accepts an old fix without expiring it", () => {
    // A stale real fix beats a generic country centroid for camera bootstrap.
    writePersistedLocation({
      lat: -1.2921,
      lng: 36.8219,
      accuracy: 20,
      capturedAt: "2019-01-01T00:00:00.000Z",
    });

    expect(readPersistedLocation()?.capturedAt).toBe("2019-01-01T00:00:00.000Z");
  });

  it.each([
    ["malformed JSON", "{not json"],
    ["a JSON array", "[]"],
    ["a JSON string", '"nope"'],
    ["null", "null"],
    [
      "a missing latitude",
      JSON.stringify({ lng: 36.8, accuracy: 1, capturedAt: "2026-07-26T08:00:00.000Z" }),
    ],
    [
      "a non-finite latitude",
      '{"lat":null,"lng":36.8,"accuracy":1,"capturedAt":"2026-07-26T08:00:00.000Z"}',
    ],
    [
      "an out-of-range latitude",
      JSON.stringify({ lat: 90.5, lng: 36.8, accuracy: 1, capturedAt: "2026-07-26T08:00:00.000Z" }),
    ],
    [
      "an out-of-range longitude",
      JSON.stringify({ lat: -1.29, lng: 181, accuracy: 1, capturedAt: "2026-07-26T08:00:00.000Z" }),
    ],
    [
      "a negative accuracy",
      JSON.stringify({
        lat: -1.29,
        lng: 36.8,
        accuracy: -1,
        capturedAt: "2026-07-26T08:00:00.000Z",
      }),
    ],
    [
      "an invalid timestamp",
      JSON.stringify({ lat: -1.29, lng: 36.8, accuracy: 1, capturedAt: "yesterday" }),
    ],
    ["a missing timestamp", JSON.stringify({ lat: -1.29, lng: 36.8, accuracy: 1 })],
  ])("rejects %s", (_label, raw) => {
    window.localStorage.setItem(STORAGE_KEY, raw);
    expect(readPersistedLocation()).toBeNull();
  });

  it("survives a throwing localStorage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });

    expect(readPersistedLocation()).toBeNull();
    expect(() =>
      writePersistedLocation({
        lat: 0,
        lng: 0,
        accuracy: 1,
        capturedAt: "2026-07-26T08:00:00.000Z",
      }),
    ).not.toThrow();
    expect(() => clearPersistedLocation()).not.toThrow();
  });
});
