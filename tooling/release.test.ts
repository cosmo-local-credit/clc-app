import { describe, expect, it } from "vite-plus/test";
import {
  parseReleaseFile,
  type ReleaseFile,
  readReleaseFile,
  releaseRegressions,
} from "./release.ts";

const valid: ReleaseFile = {
  web: { version: "0.1.0", buildNumber: 2, minimumBuild: 1 },
  admin: { version: "0.1.0", buildNumber: 1, minimumBuild: 0 },
};

function withWeb(web: Record<string, unknown>) {
  return { ...valid, web: { ...valid.web, ...web } };
}

describe("parseReleaseFile", () => {
  it("reads the checked-in file", () => {
    expect(() => readReleaseFile()).not.toThrow();
  });

  it("accepts both apps' entries", () => {
    expect(parseReleaseFile(valid, "test")).toEqual(valid);
  });

  it.each([
    ["a missing app", { web: valid.web }],
    ["an empty version", withWeb({ version: " " })],
    ["a zero milestone", withWeb({ buildNumber: 0, minimumBuild: 0 })],
    ["a fractional milestone", withWeb({ buildNumber: 1.5 })],
    ["a negative minimum", withWeb({ minimumBuild: -1 })],
    ["a minimum above the milestone", withWeb({ minimumBuild: 3 })],
  ])("rejects %s", (_, raw) => {
    expect(() => parseReleaseFile(raw, "test")).toThrow(/^test: /);
  });
});

describe("releaseRegressions", () => {
  it("allows equal and increasing milestones", () => {
    expect(releaseRegressions(valid, valid)).toEqual([]);
    expect(releaseRegressions(valid, withWeb({ buildNumber: 3 }) as ReleaseFile)).toEqual([]);
  });

  it("allows lowering a minimum for a rollback", () => {
    expect(releaseRegressions(valid, withWeb({ minimumBuild: 0 }) as ReleaseFile)).toEqual([]);
  });

  it("rejects a milestone that goes down", () => {
    expect(
      releaseRegressions(valid, withWeb({ buildNumber: 1, minimumBuild: 0 }) as ReleaseFile),
    ).toEqual(["web.buildNumber went from 2 to 1; it may only increase"]);
  });
});
