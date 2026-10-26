import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Validate the workspace LCOV and keep each Codecov flag scoped to its source. */
export function partitionCoverage(report: string, sourceFiles: ReadonlySet<string>) {
  const records = report
    .trim()
    .split(/end_of_record\s*/)
    .filter(Boolean);
  const groups = { web: "", core: "" };
  const seen = new Set<string>();
  if (records.length === 0 || !report.trimEnd().endsWith("end_of_record")) {
    throw new Error("Workspace LCOV is empty or incomplete");
  }

  for (const record of records) {
    const files = [...record.matchAll(/^SF:(.+)$/gm)];
    const file = files[0]?.[1];
    if (
      files.length !== 1 ||
      !file ||
      !sourceFiles.has(file) ||
      !/^(apps\/[^/]+\/src\/|packages\/(api|core)\/src\/|tooling\/).+\.tsx?$/.test(file) ||
      /(?:\.test\.[jt]sx?|\.d\.ts|routeTree\.gen\.ts|vitest\.config\.ts)$/.test(file)
    ) {
      throw new Error(`LCOV contains an unexpected source: ${file ?? "missing SF"}`);
    }
    if (seen.has(file)) throw new Error(`LCOV contains duplicate source: ${file}`);
    seen.add(file);
    const completeRecord = `${record.trim()}\nend_of_record\n`;
    if (file.startsWith("apps/web/src/")) groups.web += completeRecord;
    if (file.startsWith("packages/core/src/")) groups.core += completeRecord;
  }

  for (const [flag, subset] of Object.entries(groups)) {
    if (!/^DA:\d+,\d+/m.test(subset)) throw new Error(`LCOV has no executable ${flag} coverage`);
  }
  return groups;
}

export function prepareCoverage(root: string) {
  const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" });
  const groups = partitionCoverage(
    readFileSync(join(root, "coverage/lcov.info"), "utf8"),
    new Set(tracked.split("\0")),
  );
  for (const [flag, report] of Object.entries(groups)) {
    const directory = join(root, "coverage", flag);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "lcov.info"), report);
  }
}
