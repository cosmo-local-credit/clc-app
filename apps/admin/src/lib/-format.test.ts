import { describe, expect, it } from "vite-plus/test";

import { formatDate } from "./format";

describe("formatDate", () => {
  it("renders a date without the time", () => {
    const value = "2027-05-11T10:00:00Z";
    expect(formatDate(value)).toBe(new Date(value).toLocaleDateString());
  });

  it("renders a dash for an absent value and echoes an unparseable one", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
    expect(formatDate("not a date")).toBe("not a date");
  });
});
