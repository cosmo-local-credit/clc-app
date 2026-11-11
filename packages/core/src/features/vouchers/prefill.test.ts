import { describe, expect, it } from "vite-plus/test";

import { PREFILL_TAGS_MAX, PREFILL_URL_MAX_BYTES, PrefillTooLongError } from "../../lib/prefill";
import { parseVoucherPrefill, voucherPrefillHref } from "./prefill";

/** What the router's default parser hands `validateSearch` for these params. */
const v1 = (fields: Record<string, unknown>) => ({ v: 1, ...fields });

describe("parseVoucherPrefill", () => {
  it("ignores the whole prefill without v=1", () => {
    expect(parseVoucherPrefill({ name: "Mama Mboga" })).toBeNull();
    expect(parseVoucherPrefill({ v: 2, name: "Mama Mboga" })).toBeNull();
    expect(parseVoucherPrefill({ v: "2", name: "Mama Mboga" })).toBeNull();
    expect(parseVoucherPrefill({ v: true, name: "Mama Mboga" })).toBeNull();
  });

  it("accepts v as a number or its quoted form", () => {
    expect(parseVoucherPrefill({ v: 1, name: "Mama Mboga" })?.values.name).toBe("Mama Mboga");
    expect(parseVoucherPrefill({ v: "1", name: "Mama Mboga" })?.values.name).toBe("Mama Mboga");
  });

  it("applies the valid fields and drops an invalid one on its own", () => {
    const parsed = parseVoucherPrefill(
      v1({ name: "Mama Mboga", price: "-3", description: "Fresh vegetables.", symbol: "mmb" }),
    );

    expect(parsed?.values).toEqual({
      name: "Mama Mboga",
      description: "Fresh vegetables.",
      symbol: "MMB",
    });
    expect(parsed?.search).toEqual({
      v: 1,
      name: "Mama Mboga",
      description: "Fresh vegetables.",
      symbol: "mmb",
    });
  });

  it("drops an oversized description", () => {
    expect(parseVoucherPrefill(v1({ description: "x".repeat(501) }))?.values).toEqual({});
  });

  it("keeps a quoted number-looking string digit for digit", () => {
    const parsed = parseVoucherPrefill(v1({ supply: "9007199254740993.000001", price: "1.50" }));

    expect(parsed?.values).toEqual({ supply: "9007199254740993.000001", price: "1.50" });
  });

  it("drops a string field that arrived as a number, boolean or null", () => {
    const parsed = parseVoucherPrefill(
      v1({ supply: 9007199254740994, price: 1.5, name: null, description: true }),
    );

    expect(parsed?.values).toEqual({});
    expect(parsed?.search).toEqual({ v: 1 });
  });

  it("drops an array, which is what a repeated param becomes", () => {
    expect(parseVoucherPrefill(v1({ name: ["Mama Mboga", "Other"] }))?.values).toEqual({});
  });

  it("supply follows the form's six decimals", () => {
    expect(parseVoucherPrefill(v1({ supply: "1.1234567" }))?.values).toEqual({});
    expect(parseVoucherPrefill(v1({ supply: "1.123456" }))?.values).toEqual({ supply: "1.123456" });
  });

  it("takes fractional coordinates as numbers or numeric strings", () => {
    const location = { locationName: "Kibera", lat: -1.3133, lng: 36.7876, country: "KE" };

    expect(parseVoucherPrefill(v1(location))?.values.location).toEqual(location);
    expect(
      parseVoucherPrefill(v1({ ...location, lat: "-1.3133", lng: "36.7876" }))?.values.location,
    ).toEqual(location);
    expect(parseVoucherPrefill(v1({ ...location, country: "ke" }))?.values.location).toEqual(
      location,
    );
  });

  it("takes location as all four params or none", () => {
    const partial = parseVoucherPrefill(v1({ locationName: "Kibera", lat: -1.3133, lng: 36.7876 }));
    expect(partial?.values.location).toBeUndefined();
    expect(partial?.search).toEqual({ v: 1 });

    expect(
      parseVoucherPrefill(v1({ locationName: "Kibera", lat: 91, lng: 36.7876, country: "KE" }))
        ?.values.location,
    ).toBeUndefined();
    expect(
      parseVoucherPrefill(v1({ locationName: "Kibera", lat: "1e2", lng: 36.7876, country: "KE" }))
        ?.values.location,
    ).toBeUndefined();
  });

  it("splits tags, trims, title-cases and drops empties and duplicates", () => {
    expect(
      parseVoucherPrefill(v1({ tags: " food, Vegetables,,FOOD , vegetables" }))?.values,
    ).toEqual({ tags: ["Food", "Vegetables"] });
  });

  it("drops tags over the limit, or with an invalid entry", () => {
    const many = Array.from({ length: PREFILL_TAGS_MAX + 1 }, (_, index) => `tag${index}`).join(
      ",",
    );
    const twelve = Array.from({ length: PREFILL_TAGS_MAX }, (_, index) => `tag${index}`).join(",");

    expect(parseVoucherPrefill(v1({ tags: many }))?.values).toEqual({});
    expect(parseVoucherPrefill(v1({ tags: twelve }))?.values.tags).toHaveLength(PREFILL_TAGS_MAX);
    expect(parseVoucherPrefill(v1({ tags: `food,${"x".repeat(101)}` }))?.values).toEqual({});
  });

  it("takes terms only as an http(s) URL", () => {
    expect(parseVoucherPrefill(v1({ terms: "https://example.org/terms" }))?.values).toEqual({
      terms: "https://example.org/terms",
    });
    expect(parseVoucherPrefill(v1({ terms: "Be fair and pay on time." }))?.values).toEqual({});
  });

  it("takes marker enums and an https image source only", () => {
    expect(
      parseVoucherPrefill(
        v1({
          markerIcon: "food",
          markerColor: "pink",
          iconSource: "https://images.example.org/a.jpg",
        }),
      )?.values,
    ).toEqual({
      markerIcon: "food",
      markerColor: "pink",
      iconSource: "https://images.example.org/a.jpg",
    });
    expect(
      parseVoucherPrefill(
        v1({ markerIcon: "rocket", iconSource: "http://images.example.org/a.jpg" }),
      )?.values,
    ).toEqual({});
    expect(
      parseVoucherPrefill(v1({ iconSource: "https://user:pass@images.example.org/a.jpg" }))?.values,
    ).toEqual({});
  });

  it("never carries the fields a link may not set", () => {
    const parsed = parseVoucherPrefill(
      v1({
        name: "Mama Mboga",
        acceptedTerms: true,
        feeAddress: "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d",
        email: "a@example.org",
        phone: "+254712345678",
        iconUrl: "https://images.example.org/a.jpg",
        decimals: "18",
        voucherType: "expiring",
        expiryDate: "2030-01-01",
      }),
    );

    expect(parsed?.values).toEqual({ name: "Mama Mboga" });
    expect(parsed?.search).toEqual({ v: 1, name: "Mama Mboga" });
  });
});

describe("voucherPrefillHref", () => {
  it("emits the documented example", () => {
    expect(
      voucherPrefillHref({
        name: "Mama Mboga",
        price: "50",
        unitOfAccount: "KES",
        supply: "1000",
        location: { locationName: "Kibera", lat: -1.3133, lng: 36.7876, country: "KE" },
        tags: ["food", "vegetables"],
        iconSource: "https://images.example.org/v/123.jpg",
      }),
    ).toBe(
      "/vouchers/create/voucher?v=1&name=Mama+Mboga&price=%2250%22&unitOfAccount=KES" +
        "&supply=%221000%22&locationName=Kibera&lat=-1.3133&lng=36.7876&country=KE" +
        "&tags=food%2Cvegetables&iconSource=https%3A%2F%2Fimages.example.org%2Fv%2F123.jpg",
    );
  });

  it("throws over the byte budget and not at it", () => {
    const base = voucherPrefillHref({ name: "" });
    const room = PREFILL_URL_MAX_BYTES - base.length;

    expect(voucherPrefillHref({ name: "a".repeat(room) })).toHaveLength(PREFILL_URL_MAX_BYTES);
    expect(() => voucherPrefillHref({ name: "a".repeat(room + 1) })).toThrow(PrefillTooLongError);
  });
});
