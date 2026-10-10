import { describe, expect, it } from "vite-plus/test";
import { catalogWriteSchema, parseCatalogCreateSearch } from "./logic";

const write = {
  name: "Local makers",
  imageUrl: "",
  locationName: "Sarajevo",
  geoLat: 43.85,
  geoLng: 18.4,
};
describe("catalog validation", () => {
  it("accepts absolute stored images and clears images with an empty string", () => {
    expect(catalogWriteSchema.parse(write).imageUrl).toBe("");
    expect(
      catalogWriteSchema.safeParse({ ...write, imageUrl: "https://storage.test/a.webp" }).success,
    ).toBe(true);
    expect(catalogWriteSchema.safeParse({ ...write, imageUrl: "/a.webp" }).success).toBe(false);
  });
  it("requires a name and valid own location", () => {
    for (const input of [
      { name: " " },
      { name: "x".repeat(121) },
      { locationName: " " },
      { geoLat: 91 },
      { geoLng: -181 },
      { geoLat: NaN },
    ]) {
      expect(catalogWriteSchema.safeParse({ ...write, ...input }).success).toBe(false);
    }
    expect(catalogWriteSchema.parse({ ...write, name: "  Makers  " }).name).toBe("Makers");
  });
  it("keeps only complete trusted create-first intents", () => {
    const intent = { kind: "pool", resourceId: "12", address: `0x${"a".repeat(40)}` };
    expect(parseCatalogCreateSearch({ ...intent, returnTo: "https://external.test" })).toEqual(
      intent,
    );
    for (const input of [
      { ...intent, kind: "all" },
      { ...intent, resourceId: "../2" },
      { ...intent, address: "bad" },
      { kind: "pool" },
    ])
      expect(parseCatalogCreateSearch(input)).toEqual({});
  });
});
