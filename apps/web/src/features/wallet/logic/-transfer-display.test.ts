import { describe, expect, it } from "vite-plus/test";

import { formatTransferDate } from "./transfer-display";

describe("formatTransferDate", () => {
  it("formats transfer timestamps with native short date and time formatting", () => {
    expect(formatTransferDate("2026-07-02T15:20:29Z", "en-US", "UTC")).toBe("Jul 2, 3:20 PM");
  });
});
