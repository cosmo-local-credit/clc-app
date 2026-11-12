import { describe, expect, it } from "vite-plus/test";

import { parseAccountSearch } from "./account-search";

describe("parseAccountSearch", () => {
  it("keeps the retired lifecycle", () => {
    expect(parseAccountSearch({ lifecycle: "retired" }).lifecycle).toBe("retired");
  });

  it("drops an unknown lifecycle", () => {
    expect(parseAccountSearch({ lifecycle: "active" })).not.toHaveProperty("lifecycle");
    expect(parseAccountSearch({ lifecycle: 1 })).not.toHaveProperty("lifecycle");
  });

  it("keeps the status and role alongside it", () => {
    expect(
      parseAccountSearch({ status: "rejected", role: "admins", lifecycle: "retired" }),
    ).toMatchObject({ status: "REJECTED", role: "admins", lifecycle: "retired" });
  });

  it("drops an unknown status and role", () => {
    const parsed = parseAccountSearch({ status: "nope", role: "users" });
    expect(parsed).not.toHaveProperty("status");
    expect(parsed).not.toHaveProperty("role");
  });
});
