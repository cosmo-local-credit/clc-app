/**
 * `release.json` — each app's release label, milestone and published minimum.
 *
 * One entry per app so an admin release can leave web's unchanged: identity
 * hashes only the building app's `version` and `buildNumber`, so editing the
 * other app's entry does not notify this one's users.
 *
 * Node-only and dependency-free: both app builds import it through their Vite
 * configs, and CI runs `check-release.ts` with plain `node`.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export type AppName = "web" | "admin";

interface AppRelease {
  /** Human-facing label, shown in settings. Never compared. */
  version: string;
  /** Milestone, bumped only when a release must be selectable as a minimum. */
  buildNumber: number;
  /** Builds below this one get a persistent update banner. */
  minimumBuild: number;
}

export type ReleaseFile = Record<AppName, AppRelease>;

const APPS: readonly AppName[] = ["web", "admin"];

const RELEASE_FILE_PATH = fileURLToPath(new URL("../release.json", import.meta.url));

export function readReleaseFile(): ReleaseFile {
  return parseReleaseFile(
    JSON.parse(readFileSync(RELEASE_FILE_PATH, "utf8")) as unknown,
    RELEASE_FILE_PATH,
  );
}

export function parseReleaseFile(raw: unknown, source: string): ReleaseFile {
  if (!isRecord(raw)) throw new Error(`${source}: expected an object keyed by app`);

  const parsed: Partial<ReleaseFile> = {};
  for (const app of APPS) {
    const entry = raw[app];
    if (!isRecord(entry)) throw new Error(`${source}: missing "${app}" entry`);
    const { version, buildNumber, minimumBuild } = entry;
    if (typeof version !== "string" || version.trim() === "") {
      throw new Error(`${source}: ${app}.version must be a non-empty string`);
    }
    if (!Number.isSafeInteger(buildNumber) || (buildNumber as number) < 1) {
      throw new Error(`${source}: ${app}.buildNumber must be a positive integer`);
    }
    if (
      !Number.isSafeInteger(minimumBuild) ||
      (minimumBuild as number) < 0 ||
      (minimumBuild as number) > (buildNumber as number)
    ) {
      // A floor above the release publishing it can never be met by updating.
      throw new Error(`${source}: ${app}.minimumBuild must be between 0 and ${app}.buildNumber`);
    }
    parsed[app] = {
      version,
      buildNumber: buildNumber as number,
      minimumBuild: minimumBuild as number,
    };
  }
  return parsed as ReleaseFile;
}

/**
 * Problems with moving from `previous` to `next` on one deployment branch.
 *
 * A milestone that goes down lets two different releases share a number, and a
 * minimum can then no longer tell them apart. Lowering `minimumBuild` stays
 * allowed: it is how a rollback stops asking users to update to a release that
 * is no longer served.
 */
export function releaseRegressions(previous: ReleaseFile, next: ReleaseFile): string[] {
  return APPS.filter((app) => next[app].buildNumber < previous[app].buildNumber).map(
    (app) =>
      `${app}.buildNumber went from ${previous[app].buildNumber} to ${next[app].buildNumber}; it may only increase`,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
