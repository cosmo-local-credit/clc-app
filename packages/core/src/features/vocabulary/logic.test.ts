import { describe, expect, it } from "vite-plus/test";
import { toVocabularyTitleCase, validateCustomTag, validateCustomUnit } from "./logic";

describe("custom vocabulary", () => {
  it("trims, collapses whitespace, and title-cases every word", () => {
    expect(toVocabularyTitleCase("  urban   FARMING ")).toBe("Urban Farming");
  });

  it("rejects blank, comma-delimited, and over-limit tags", () => {
    expect(validateCustomTag("  ")).toBe("Enter a tag");
    expect(validateCustomTag("Food, Water")).toBe("Tags must not contain commas");
    expect(validateCustomTag("a".repeat(101))).toBe("Tags must be 100 characters or fewer");
  });

  it("accepts a unit up to 32 characters", () => {
    expect(validateCustomUnit("Produce Crate")).toBeNull();
    expect(validateCustomUnit("a".repeat(33))).toBe("Unit must be 32 characters or fewer");
  });
});
