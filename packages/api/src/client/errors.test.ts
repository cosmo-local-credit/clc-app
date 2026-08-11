import { describe, expect, it } from "vite-plus/test";
import { BackendApiError, formatBackendApiError } from "./errors";

describe("BackendApiError", () => {
  it("uses the description as the Error message so unhandled throws read usefully", () => {
    const err = new BackendApiError(500, "Internal Server Error");
    expect(err.message).toBe("Internal Server Error");
    expect(err.name).toBe("BackendApiError");
    expect(err).toBeInstanceOf(Error);
  });

  it("retains the status and optional backend code", () => {
    const err = new BackendApiError(403, "pending approval", "E10");
    expect(err.status).toBe(403);
    expect(err.code).toBe("E10");
  });
});

describe("formatBackendApiError", () => {
  it("prefixes the backend code when there is one", () => {
    const err = new BackendApiError(403, "account is pending approval by a superadmin", "E10");
    expect(formatBackendApiError(err)).toBe("E10: account is pending approval by a superadmin");
  });

  it("returns the description alone when there is no code", () => {
    expect(formatBackendApiError(new BackendApiError(500, "Internal Server Error"))).toBe(
      "Internal Server Error",
    );
  });
});
