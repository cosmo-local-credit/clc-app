import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  MAX_PERSISTED_LOCATION_AGE_MS,
  clearPersistedLocation,
  readPersistedLocation,
  writePersistedLocation,
} from "./last-location-storage";

const STORAGE_KEY = "clc_last_location_v2";
const OWNER = "guest";

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
      owner: OWNER,
      lat: -1.2921,
      lng: 36.8219,
      accuracy: 12.5,
      capturedAt: "2026-07-26T08:00:00.000Z",
    });

    expect(readPersistedLocation(OWNER)).toEqual({
      owner: OWNER,
      lat: -1.2921,
      lng: 36.8219,
      accuracy: 12.5,
      capturedAt: "2026-07-26T08:00:00.000Z",
    });
  });

  it("uses the versioned storage key", () => {
    writePersistedLocation({
      owner: OWNER,
      lat: 0,
      lng: 0,
      accuracy: 1,
      capturedAt: "2026-07-26T08:00:00.000Z",
    });

    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it("returns null when nothing is stored", () => {
    expect(readPersistedLocation(OWNER)).toBeNull();
  });

  it("clears the stored fix", () => {
    writePersistedLocation({
      owner: OWNER,
      lat: -1.2921,
      lng: 36.8219,
      accuracy: 12.5,
      capturedAt: "2026-07-26T08:00:00.000Z",
    });

    clearPersistedLocation();

    expect(readPersistedLocation(OWNER)).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("discards a long-stale fix instead of bootstrapping from it", () => {
    // The original plan kept old fixes forever, reasoning that a stale real
    // fix beats a country centroid. That left a guest's precise position on a
    // shared device with no cleanup path, so retention is now bounded.
    writePersistedLocation({
      owner: OWNER,
      lat: -1.2921,
      lng: 36.8219,
      accuracy: 20,
      capturedAt: "2019-01-01T00:00:00.000Z",
    });

    expect(readPersistedLocation(OWNER)).toBeNull();
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
    expect(readPersistedLocation(OWNER)).toBeNull();
  });

  it("survives a throwing localStorage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });

    expect(readPersistedLocation(OWNER)).toBeNull();
    expect(() =>
      writePersistedLocation({
        owner: OWNER,
        lat: 0,
        lng: 0,
        accuracy: 1,
        capturedAt: "2026-07-26T08:00:00.000Z",
      }),
    ).not.toThrow();
    expect(() => clearPersistedLocation()).not.toThrow();
  });
});

describe("persisted location scoping and expiry", () => {
  const NOW = Date.parse("2026-07-26T12:00:00.000Z");

  function write(owner: string, capturedAt: string) {
    writePersistedLocation({ lat: -1.29, lng: 36.82, accuracy: 10, capturedAt, owner });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns a fix only to the owner that stored it", () => {
    write("0xaaa", new Date(NOW).toISOString());

    expect(readPersistedLocation("0xaaa")).not.toBeNull();
    // Switching accounts, or a session expiring into guest mode, must not
    // inherit the previous person's precise location.
    expect(readPersistedLocation("0xbbb")).toBeNull();
    expect(readPersistedLocation("guest")).toBeNull();
  });

  it("does not hand a guest fix to a signed-in account", () => {
    write("guest", new Date(NOW).toISOString());

    expect(readPersistedLocation("guest")).not.toBeNull();
    expect(readPersistedLocation("0xaaa")).toBeNull();
  });

  it("expires a fix older than the retention window", () => {
    write("guest", new Date(NOW - (MAX_PERSISTED_LOCATION_AGE_MS + 1000)).toISOString());

    // A guest never signs out, so without expiry a precise location would sit
    // on a shared device indefinitely.
    expect(readPersistedLocation("guest")).toBeNull();
  });

  it("keeps a fix inside the retention window", () => {
    write("guest", new Date(NOW - (MAX_PERSISTED_LOCATION_AGE_MS - 1000)).toISOString());

    expect(readPersistedLocation("guest")).not.toBeNull();
  });

  it("discards an expired fix from storage rather than leaving it readable", () => {
    write("guest", new Date(NOW - (MAX_PERSISTED_LOCATION_AGE_MS + 1000)).toISOString());

    readPersistedLocation("guest");

    expect(window.localStorage.getItem("clc_last_location_v2")).toBeNull();
  });

  it("rejects a stored record with no owner", () => {
    window.localStorage.setItem(
      "clc_last_location_v2",
      JSON.stringify({
        lat: -1.29,
        lng: 36.82,
        accuracy: 10,
        capturedAt: new Date(NOW).toISOString(),
      }),
    );

    expect(readPersistedLocation("guest")).toBeNull();
  });
});
