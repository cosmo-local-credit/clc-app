/**
 * CI gate for `release.json`: `node tooling/check-release.ts <previous-sha>`.
 *
 * Validates the file (both apps present, `0 <= minimumBuild <= buildNumber`)
 * and that no app's `buildNumber` went down since the branch's previous tip.
 * Run by plain `node`, which strips the types, so it imports with extensions.
 */
import { execFileSync } from "node:child_process";
import { parseReleaseFile, readReleaseFile, releaseRegressions } from "./release.ts";

const next = readReleaseFile();
const base = process.argv[2]?.trim();

if (!base || /^0+$/.test(base)) {
  console.log("release.json is valid; there is no previous tip to compare with.");
  process.exit(0);
}

const git = (args: string[]) =>
  execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });

try {
  git(["cat-file", "-e", `${base}^{commit}`]);
} catch {
  // A force push can drop the previous tip from the remote. Say so rather than
  // passing silently as if the comparison had run.
  console.log(
    `::warning file=release.json::${base} is not available; milestones were not compared`,
  );
  process.exit(0);
}

let previous: string;
try {
  previous = git(["show", `${base}:release.json`]);
} catch {
  console.log(`release.json is valid; ${base} has no release.json to compare with.`);
  process.exit(0);
}

const problems = releaseRegressions(
  parseReleaseFile(JSON.parse(previous) as unknown, `${base}:release.json`),
  next,
);
for (const problem of problems) console.log(`::error file=release.json::${problem}`);
if (problems.length > 0) process.exit(1);
console.log(`release.json is valid and no milestone decreased since ${base}.`);
