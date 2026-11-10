import { describe, expect, it } from "vite-plus/test";

import { formatSubmittedAt } from "./otx";

describe("formatSubmittedAt", () => {
  it("formats an ISO timestamp in the given locale", () => {
    const value = "2026-06-18T09:05:00Z";
    expect(formatSubmittedAt(value, "en-GB")).toBe(
      new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(value),
      ),
    );
  });

  it("shows a value that is not a date as it came", () => {
    expect(formatSubmittedAt("soon", "en")).toBe("soon");
  });
});
