import { describe, expect, it } from "vite-plus/test";
import { resolveWantState, wantContactFrom, wantSchema, wantWriteSchema } from "./logic";

const baseWrite = {
  name: "Bicycle repair",
  description: "Looking for help repairing a wheel",
  location: { lat: -1.286, lng: 36.817, locationName: "Nairobi", country: "KE" },
  startsAt: "2026-10-24T08:00:00.000Z",
  expiresAt: null,
  imageUrl: null,
  contactText: "Meet near the market",
  shareEmail: false,
  sharePhone: false,
  markerIcon: "question" as const,
  markerColor: "orange" as const,
  tags: ["Repair"],
};

const want = {
  id: "7",
  ownerUserId: "3",
  name: baseWrite.name,
  description: baseWrite.description,
  locationName: baseWrite.location.locationName,
  geoLat: baseWrite.location.lat,
  geoLng: baseWrite.location.lng,
  startsAt: baseWrite.startsAt,
  expiresAt: null,
  status: "OPEN" as const,
  state: "active" as const,
  tags: baseWrite.tags,
  imageUrl: null,
  effectiveImageUrl: null,
  markerIcon: "question" as const,
  markerColor: "orange" as const,
  ownerName: "Amina",
  ownerUsername: "amina",
};

describe("Want contracts", () => {
  it("requires one public contact method and validates expiration after Start", () => {
    expect(wantWriteSchema.safeParse(baseWrite).success).toBe(true);
    expect(
      wantWriteSchema.safeParse({
        ...baseWrite,
        contactText: null,
        shareEmail: false,
        sharePhone: false,
      }).success,
    ).toBe(false);
    expect(
      wantWriteSchema.safeParse({
        ...baseWrite,
        expiresAt: "2026-10-24T07:59:59.000Z",
      }).success,
    ).toBe(false);
  });

  it("accepts every Want-only marker and at most twelve shared tags", () => {
    for (const markerIcon of ["question", "message", "request"] as const) {
      expect(wantWriteSchema.safeParse({ ...baseWrite, markerIcon }).success).toBe(true);
    }
    expect(
      wantWriteSchema.safeParse({
        ...baseWrite,
        tags: Array.from({ length: 13 }, (_, index) => `Tag ${index}`),
      }).success,
    ).toBe(false);
  });

  it("normalizes numeric IDs and exposes only populated contact values", () => {
    const parsed = wantSchema.parse({
      ...want,
      id: 7,
      ownerUserId: 3,
      contactText: "Meet near the market",
      email: "amina@example.test",
      phone: null,
    });
    expect(parsed.id).toBe("7");
    expect(parsed.ownerUserId).toBe("3");
    expect(wantContactFrom(parsed)).toEqual({
      text: "Meet near the market",
      email: "amina@example.test",
    });
    expect(wantContactFrom(wantSchema.parse(want))).toBeUndefined();
  });
});

describe("Want lifecycle", () => {
  const now = new Date("2026-10-24T12:00:00.000Z");

  it.each([
    ["closed", { status: "CLOSED", startsAt: "2026-10-23T00:00:00.000Z", expiresAt: null }],
    ["scheduled", { status: "OPEN", startsAt: "2026-10-25T00:00:00.000Z", expiresAt: null }],
    [
      "expired",
      {
        status: "OPEN",
        startsAt: "2026-10-23T00:00:00.000Z",
        expiresAt: "2026-10-24T12:00:00.000Z",
      },
    ],
    ["active", { status: "OPEN", startsAt: "2026-10-23T00:00:00.000Z", expiresAt: null }],
  ] as const)("resolves %s", (state, input) => {
    expect(resolveWantState(input, now)).toBe(state);
  });
});
