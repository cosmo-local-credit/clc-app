import { describe, expect, it } from "vite-plus/test";
import { BackendApiError } from "@clc/api/client/errors";
import type { SessionResult } from "@clc/api/features/auth/client";
import { resolveSession } from "./admin-session";

const SUPERADMIN_ROLE = "SUPERADMIN";

const ADDRESS = "0x33a573149db22e759fB9A38Bcc461C12855c2645";

function session(role: string | undefined): SessionResult {
  return { address: ADDRESS, chainId: 42220, role };
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

  it("reports authenticated for a superadmin session", () => {
    expect(resolveSession(query({ data: session(SUPERADMIN_ROLE) }))).toEqual({
      status: "authenticated",
      operator: { address: ADDRESS, role: SUPERADMIN_ROLE },
    });
  });

  it("reports authenticated for an admin session", () => {
    expect(resolveSession(query({ data: session("ADMIN") }))).toEqual({
      status: "authenticated",
      operator: { address: ADDRESS, role: "ADMIN" },
    });
  });

  it("reports unauthenticated when there is no session", () => {
    expect(resolveSession(query({ data: null }))).toEqual({ status: "unauthenticated" });
  });

  it("reports unauthorized, not unauthenticated, for a signed-in user", () => {
    // Telling a signed-in operator to sign in again is a dead end; the two states
    // must stay distinct.
    expect(resolveSession(query({ data: session("USER") }))).toEqual({
      status: "unauthorized",
      operator: { address: ADDRESS, role: "USER" },
    });
  });

  it("reports unavailable, not unauthorized, when the backend omits the role", () => {
    // A backend too old to report the role cannot be distinguished from a
    // privileged one, and denying a real superadmin with "not authorized" would
    // send them hunting a permission problem that does not exist.
    const state = resolveSession(query({ data: session(undefined) }));
    expect(state.status).toBe("unavailable");
  });

  it("reports unavailable when the session check itself failed", () => {
    const state = resolveSession(
      query({ isError: true, error: new Error("gateway down"), data: undefined }),
    );
    expect(state).toEqual({ status: "unavailable", message: "gateway down" });
  });

  it("reports unauthenticated when the session check returns 401", () => {
    const state = resolveSession(
      query({
        isError: true,
        error: new BackendApiError(401, "session expired"),
        data: undefined,
      }),
    );
    expect(state).toEqual({ status: "unauthenticated" });
  });

  it("never reports authenticated on a failed session check", () => {
    // A failed check must lock the console, not fall through to open access on
    // cached data.
    const state = resolveSession(
      query({ isError: true, error: new Error("boom"), data: session(SUPERADMIN_ROLE) }),
    );
    expect(state.status).toBe("unavailable");
  });

  it("is case-sensitive about the role, matching the backend's own comparison", () => {
    expect(resolveSession(query({ data: session("superadmin") })).status).toBe("unauthorized");
  });
});
