import { describe, expect, it } from "vite-plus/test";
import { type AppBuildInfo, appBuildInfoSchema, evaluateAppUpdate } from "./logic";

const loaded: AppBuildInfo = {
  schemaVersion: 1,
  app: "web",
  environment: "staging",
  chainId: 100,
  version: "0.1.0",
  buildNumber: 2,
  minimumBuild: 0,
  gitSha: "0123456789abcdef0123456789abcdef01234567",
  dirty: false,
  builtAt: "2026-10-05T09:00:00.000Z",
  buildId: "a".repeat(64),
};

function live(overrides: Partial<AppBuildInfo>): AppBuildInfo {
  return { ...loaded, ...overrides };
}

const enforced = { enforceMinimum: true };

describe("appBuildInfoSchema", () => {
  it("accepts a deployment descriptor", () => {
    expect(appBuildInfoSchema.parse(loaded)).toEqual(loaded);
  });

  it("rejects a floor above the deployment publishing it", () => {
    const result = appBuildInfoSchema.safeParse(live({ minimumBuild: 3 }));
    expect(result.success).toBe(false);
  });

  it("accepts a floor equal to the deployment's own milestone", () => {
    expect(appBuildInfoSchema.safeParse(live({ minimumBuild: 2 })).success).toBe(true);
  });

  it("rejects an HTML fallback parsed as something else", () => {
    expect(appBuildInfoSchema.safeParse({ schemaVersion: 2 }).success).toBe(false);
    expect(appBuildInfoSchema.safeParse(live({ buildId: "not-a-digest" })).success).toBe(false);
  });
});

describe("evaluateAppUpdate", () => {
  it("reports nothing when the origin serves this build", () => {
    expect(evaluateAppUpdate(loaded, live({}), enforced)).toEqual({ kind: "current" });
  });

  it("ignores a different commit and build time with the same inputs", () => {
    const rebuilt = live({
      gitSha: "fedcba9876543210fedcba9876543210fedcba98",
      builtAt: "2026-10-06T09:00:00.000Z",
    });
    expect(evaluateAppUpdate(loaded, rebuilt, enforced)).toEqual({ kind: "current" });
  });

  it("offers a different deployment that still supports this build", () => {
    const target = live({ buildId: "b".repeat(64), minimumBuild: 2 });
    expect(evaluateAppUpdate(loaded, target, enforced)).toEqual({ kind: "available", target });
  });

  it("offers a rollback to a lower-numbered deployment", () => {
    const target = live({ buildId: "b".repeat(64), buildNumber: 1, minimumBuild: 1 });
    expect(evaluateAppUpdate(loaded, target, enforced)).toEqual({ kind: "available", target });
  });

  it("requires an update when this build is below the live minimum", () => {
    const target = live({ buildId: "b".repeat(64), buildNumber: 3, minimumBuild: 3 });
    expect(evaluateAppUpdate(loaded, target, enforced)).toEqual({ kind: "required", target });
  });

  it("only offers an update below the minimum when enforcement is off", () => {
    const target = live({ buildId: "b".repeat(64), buildNumber: 3, minimumBuild: 3 });
    expect(evaluateAppUpdate(loaded, target, { enforceMinimum: false })).toEqual({
      kind: "available",
      target,
    });
  });

  it.each([
    ["app", { app: "admin" }],
    ["environment", { environment: "prod" }],
    ["chain", { chainId: 42220 }],
  ] satisfies [string, Partial<AppBuildInfo>][])(
    "ignores a descriptor for another %s",
    (_, overrides) => {
      const other = live({
        ...overrides,
        buildId: "b".repeat(64),
        buildNumber: 9,
        minimumBuild: 9,
      });
      expect(evaluateAppUpdate(loaded, other, enforced)).toEqual({ kind: "current" });
    },
  );
});
