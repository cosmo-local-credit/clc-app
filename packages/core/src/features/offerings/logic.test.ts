import { describe, expect, it } from "vite-plus/test";

import { OFFERING_UNITS, emptyOfferingWrite, isOfferingUnit, offeringWriteSchema } from "./logic";

const valid = {
  name: "Fresh maize flour",
  description: "Stone-ground flour packed on collection day.",
  unit: "kg" as const,
  pricePerUnit: "120.50",
  imageUrl: null,
};

describe("the closed sets", () => {
  // The exact set, not "at least these": a unit this list gains without the
  // migration gaining it is a 400 from clc-core, and one the migration gains
  // without this list is a unit no form can offer.
  it("holds exactly the fifteen canonical units", () => {
    expect(OFFERING_UNITS).toEqual([
      "kg",
      "g",
      "litre",
      "item",
      "hour",
      "day",
      "bag",
      "unit",
      "bundle",
      "piece",
      "dozen",
      "serving",
      "trip",
      "session",
      "metre",
    ]);
  });

  it("recognises members and rejects everything else", () => {
    expect(isOfferingUnit("kg")).toBe(true);
    expect(isOfferingUnit("KG")).toBe(false);
    expect(isOfferingUnit("50kg sack")).toBe(false);
    expect(isOfferingUnit(undefined)).toBe(false);
  });
});

describe("offeringWriteSchema", () => {
  it("accepts a complete offering", () => {
    expect(offeringWriteSchema.parse(valid)).toEqual(valid);
  });

  it("trims text before it measures it", () => {
    const parsed = offeringWriteSchema.parse({
      ...valid,
      name: "  Fresh maize flour  ",
      description: "  Stone-ground.  ",
    });
    expect(parsed.name).toBe("Fresh maize flour");
    expect(parsed.description).toBe("Stone-ground.");
  });

  // Whitespace-only is blank, not a valid string of that length.
  it.each([
    ["a blank name", { name: "   " }],
    ["a blank description", { description: "\t\n " }],
    ["a name over 120 characters", { name: "a".repeat(121) }],
    ["a description over 2000 characters", { description: "a".repeat(2001) }],
    ["an empty unit", { unit: "" }],
    ["a unit over 32 characters", { unit: "a".repeat(33) }],
    ["a data URI photo", { imageUrl: "data:image/png;base64,AAAA" }],
    ["a scheme-relative photo", { imageUrl: "//content.example/a.webp" }],
    ["a bare path photo", { imageUrl: "/offering/a.webp" }],
  ])("rejects %s", (_label, override) => {
    expect(offeringWriteSchema.safeParse({ ...valid, ...override }).success).toBe(false);
  });

  it.each(["50kg Sack", "KG", "Produce Crate"])("accepts the custom unit %s", (unit) => {
    expect(offeringWriteSchema.safeParse({ ...valid, unit }).success).toBe(true);
  });

  it.each([
    ["an exponent", "1e3"],
    ["a thousands separator", "1,000.50"],
    ["an underscore separator", "1_000"],
    ["a leading plus", "+120.50"],
    ["a negative value", "-1"],
    ["zero", "0"],
    ["padded zero", "0.00"],
    ["a trailing dot", "120."],
    ["a leading dot", ".5"],
    ["words", "free"],
    ["nothing", ""],
  ])("rejects a price with %s", (_label, pricePerUnit) => {
    expect(offeringWriteSchema.safeParse({ ...valid, pricePerUnit }).success).toBe(false);
  });

  // The whole reason the price is a string. Each of these is a value `Number`
  // cannot round-trip, and each has to arrive at NUMERIC exactly as typed.
  it.each([
    "120.50",
    "0.000000000000000001",
    "9007199254740993",
    "12345678901234567890.12345",
    "99999999999999999999999999999999",
  ])("preserves %s digit for digit", (pricePerUnit) => {
    expect(offeringWriteSchema.parse({ ...valid, pricePerUnit }).pricePerUnit).toBe(pricePerUnit);
  });

  it("accepts either photo scheme and treats null as no photo", () => {
    for (const imageUrl of [
      "https://content.example/offering/a_800_b.webp",
      "http://content.example/offering/a_800_b.webp",
      "HTTPS://content.example/offering/a_800_b.webp",
      null,
    ]) {
      expect(offeringWriteSchema.safeParse({ ...valid, imageUrl }).success).toBe(true);
    }
  });
});

describe("emptyOfferingWrite", () => {
  // The issuer must choose a unit.
  it("starts with no unit chosen", () => {
    expect(emptyOfferingWrite.unit).toBe("");
    expect(emptyOfferingWrite.imageUrl).toBeNull();
  });

  it("does not validate until the issuer fills it in", () => {
    expect(offeringWriteSchema.safeParse(emptyOfferingWrite).success).toBe(false);
  });
});
