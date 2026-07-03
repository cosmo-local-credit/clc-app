import { describe, expect, it } from "vite-plus/test";

import { formatTokenAmount, formatTokenAmountFixed, parseTokenAmount } from "./logic";

describe("formatTokenAmount", () => {
  it("formats raw token units with up to two decimal places", () => {
    expect(formatTokenAmount("100000", 6)).toBe("0.1");
    expect(formatTokenAmount("1234567", 6)).toBe("1.23");
    expect(formatTokenAmount("1000000000000000000", 18)).toBe("1");
  });
});

describe("formatTokenAmountFixed", () => {
  it("keeps exactly two displayed decimals while truncating token dust", () => {
    expect(formatTokenAmountFixed("2134567", 6, 2)).toBe("2.13");
    expect(formatTokenAmountFixed("2000000", 6, 2)).toBe("2.00");
    expect(formatTokenAmountFixed("5", 0, 2)).toBe("5.00");
  });
});

describe("parseTokenAmount", () => {
  it("turns an entered decimal amount into raw token units", () => {
    expect(parseTokenAmount("2.13", 6)).toBe("2130000");
    expect(parseTokenAmount("2", 6)).toBe("2000000");
    expect(parseTokenAmount("0.01", 6)).toBe("10000");
  });
});
