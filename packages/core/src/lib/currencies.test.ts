import { describe, expect, it } from "vite-plus/test";

import {
  findUnitOfAccountOption,
  formatUnitOfAccountOption,
  ISO_CURRENCIES,
  UNIT_OF_ACCOUNT_OPTIONS,
} from "./currencies";

describe("unit-of-account currency catalog", () => {
  it("contains the complete Sarafu ISO currency set plus the time unit", () => {
    expect(ISO_CURRENCIES).toHaveLength(155);
    expect(UNIT_OF_ACCOUNT_OPTIONS).toHaveLength(156);
    expect(new Set(UNIT_OF_ACCOUNT_OPTIONS.map((option) => option.code)).size).toBe(156);
    expect(findUnitOfAccountOption("TZS")?.name).toBe("Tanzanian Shilling");
    expect(findUnitOfAccountOption("HOUR")?.name).toBe("Hour");
  });

  it("uses a plain hyphen and the requested Kenyan currency label", () => {
    const kes = findUnitOfAccountOption("KES");
    if (!kes) throw new Error("KES is missing from the currency catalog");
    expect(formatUnitOfAccountOption(kes)).toBe("KES - Kenyan Shillings");
    expect(formatUnitOfAccountOption(kes)).not.toContain("—");
  });
});
