import { describe, expect, it } from "vite-plus/test";
import { ADMIN_CONSOLE_PERMISSION, type AdminOperator, resolveSession } from "./admin-session";

function operator(permissions: Array<string>): AdminOperator {
  return { address: "0xabc", name: "Ada", role: "steward", permissions };
}

function query(overrides: Partial<Parameters<typeof resolveSession>[0]> = {}) {
  return { isPending: false, isError: false, error: null, data: null, ...overrides };
}

describe("resolveSession", () => {
  it("reports loading while the session request is in flight", () => {
    expect(resolveSession(query({ isPending: true, data: undefined }))).toEqual({
      status: "loading",
    });
  });

  it("reports authenticated when the operator holds the console permission", () => {
    const holder = operator([ADMIN_CONSOLE_PERMISSION]);
    expect(resolveSession(query({ data: holder }))).toEqual({
      status: "authenticated",
      operator: holder,
    });
  });

  it("reports unauthenticated when there is no session", () => {
    expect(resolveSession(query({ data: null }))).toEqual({ status: "unauthenticated" });
  });

  it("reports unauthorized, not unauthenticated, for a signed-in operator lacking the permission", () => {
    // Telling a signed-in operator to sign in again is a dead end; the two states
    // must stay distinct.
    const outsider = operator(["something:else"]);
    expect(resolveSession(query({ data: outsider }))).toEqual({
      status: "unauthorized",
      operator: outsider,
    });
  });

  it("reports unavailable when the session check itself failed", () => {
    const state = resolveSession(
      query({ isError: true, error: new Error("gateway down"), data: undefined }),
    );
    expect(state).toEqual({ status: "unavailable", message: "gateway down" });
  });

  it("never reports authenticated on a failed session check", () => {
    // A failed check must lock the console, not fall through to open access.
    const state = resolveSession(
      query({
        isError: true,
        error: new Error("boom"),
        data: operator([ADMIN_CONSOLE_PERMISSION]),
      }),
    );
    expect(state.status).toBe("unavailable");
  });

  it("treats an operator with no permissions as unauthorized", () => {
    expect(resolveSession(query({ data: operator([]) })).status).toBe("unauthorized");
  });
});
