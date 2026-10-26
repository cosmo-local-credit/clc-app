import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { partitionCoverage, prepareCoverage } from "./coverage.ts";

const web = "apps/web/src/features/home/ui/market-page.tsx";
const core = "packages/core/src/lib/market-bounds.ts";
const api = "packages/api/src/features/market-map/client.ts";
const admin = "apps/admin/src/features/reports/editor.tsx";
const record = (file: string) => `SF:${file}\nDA:12,1\nLF:1\nLH:1\nend_of_record\n`;
const report = [web, core, api, admin].map(record).join("");
const sources = new Set([web, core, api, admin]);

describe("workspace coverage reports", () => {
  it("preserves executable records while isolating the existing web and core flags", () => {
    const groups = partitionCoverage(report, sources);
    expect(groups.web).toBe(record(web));
    expect(groups.core).toBe(record(core));
    expect(report).toContain(record(api));
    expect(report).toContain(record(admin));
  });

  it.each([
    ["empty", ""],
    ["truncated", report.replace(/end_of_record\n$/, "")],
    ["missing source", "DA:1,1\nend_of_record\n"],
    ["multiple sources", `SF:${api}\n${report}`],
    ["duplicate source", report + record(web)],
    ["untracked source", report + record("apps/web/src/deleted.ts")],
    ["missing web", record(core)],
    ["missing core", record(web)],
    ["non-executable web", report.replace("DA:12,1", "")],
  ])("rejects %s reports instead of silently uploading another file", (_, invalid) => {
    expect(() => partitionCoverage(invalid, sources)).toThrow();
  });

  it.each([
    "apps/web/src/map.test.tsx",
    "packages/api/src/client.test.ts",
    "apps/web/src/env.d.ts",
    "apps/web/src/routeTree.gen.ts",
    "tooling/vitest.config.ts",
    "coverage/generated.ts",
    "/tmp/clc-app/apps/web/src/map.ts",
  ])("rejects non-source coverage even when tracked: %s", (file) => {
    expect(() => partitionCoverage(report + record(file), new Set([...sources, file]))).toThrow(
      /unexpected source/,
    );
  });

  it("runs CI preparation from the checkout root and fails for missing or invalid reports", () => {
    const root = mkdtempSync(join(tmpdir(), "clc-coverage-"));
    try {
      execFileSync("git", ["init", "--quiet"], { cwd: root });
      for (const file of sources) {
        mkdirSync(dirname(join(root, file)), { recursive: true });
        writeFileSync(join(root, file), "export const value = 1;\n");
      }
      execFileSync("git", ["add", "."], { cwd: root });
      expect(() => prepareCoverage(root)).toThrow(/ENOENT/);
      mkdirSync(join(root, "coverage"));
      writeFileSync(join(root, "coverage/lcov.info"), report);
      prepareCoverage(root);
      expect(readFileSync(join(root, "coverage/lcov.info"), "utf8")).toBe(report);
      expect(readFileSync(join(root, "coverage/web/lcov.info"), "utf8")).toBe(record(web));
      expect(readFileSync(join(root, "coverage/core/lcov.info"), "utf8")).toBe(record(core));
      writeFileSync(join(root, "coverage/lcov.info"), report + record("apps/web/src/stale.ts"));
      expect(() => prepareCoverage(root)).toThrow(/unexpected source/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
