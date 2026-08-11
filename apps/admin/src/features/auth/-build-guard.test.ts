import { describe, expect, it } from "vite-plus/test";
import {
  STUB_AUTH_ENV_VAR,
  StubAuthInProductionBuildError,
  assertAuthIsDeployable,
  isStubAuthEnabled,
} from "./build-guard";

const STUBBED = { [STUB_AUTH_ENV_VAR]: "true" };
const REAL = { [STUB_AUTH_ENV_VAR]: "false" };

describe("isStubAuthEnabled", () => {
  it("is enabled only for the exact string true", () => {
    expect(isStubAuthEnabled(STUBBED)).toBe(true);
    expect(isStubAuthEnabled(REAL)).toBe(false);
    expect(isStubAuthEnabled({})).toBe(false);
    // Guard against a truthy-string mistake enabling the stub by accident.
    expect(isStubAuthEnabled({ [STUB_AUTH_ENV_VAR]: "TRUE" })).toBe(false);
    expect(isStubAuthEnabled({ [STUB_AUTH_ENV_VAR]: "1" })).toBe(false);
  });
});

describe("assertAuthIsDeployable", () => {
  it("fails a production build while auth is stubbed", () => {
    expect(() =>
      assertAuthIsDeployable({ command: "build", mode: "production", env: STUBBED }),
    ).toThrow(StubAuthInProductionBuildError);
  });

  it("names the env var and the unblocking work in the failure message", () => {
    // The message is the whole value of the guard — whoever hits it in CI must
    // learn what to do without reading this file.
    let message = "";
    try {
      assertAuthIsDeployable({ command: "build", mode: "production", env: STUBBED });
    } catch (error) {
      message = error instanceof Error ? error.message : "";
    }
    expect(message).toContain(STUB_AUTH_ENV_VAR);
    expect(message).toContain("docs/admin-architecture.md");
  });

  it("fails any non-development build mode, not just the literal production", () => {
    expect(() =>
      assertAuthIsDeployable({ command: "build", mode: "staging", env: STUBBED }),
    ).toThrow(StubAuthInProductionBuildError);
  });

  it("allows the dev server to use the stub", () => {
    expect(() =>
      assertAuthIsDeployable({ command: "serve", mode: "development", env: STUBBED }),
    ).not.toThrow();
  });

  it("allows a deliberate development-mode build for local verification", () => {
    expect(() =>
      assertAuthIsDeployable({ command: "build", mode: "development", env: STUBBED }),
    ).not.toThrow();
  });

  it("allows a production build once auth is no longer stubbed", () => {
    expect(() =>
      assertAuthIsDeployable({ command: "build", mode: "production", env: REAL }),
    ).not.toThrow();
    expect(() =>
      assertAuthIsDeployable({ command: "build", mode: "production", env: {} }),
    ).not.toThrow();
  });
});
