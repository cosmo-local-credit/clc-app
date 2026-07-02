import { describe, expect, it } from "vite-plus/test";

import { formatTokenAmount } from "./logic";

describe("formatTokenAmount", () => {
  it("formats raw token units with up to two decimal places", () => {
    expect(formatTokenAmount("100000", 6)).toBe("0.1");
    expect(formatTokenAmount("1234567", 6)).toBe("1.23");
    expect(formatTokenAmount("1000000000000000000", 18)).toBe("1");
  });
});
