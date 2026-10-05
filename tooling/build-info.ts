/**
 * Build identity for one app build, resolved once per Vite configuration.
 *
 * The result is inlined into the client, SSR and web's service worker as
 * `__CLC_BUILD_INFO__` and published by the same build as `/build-info.json`,
 * validated against `appBuildInfoSchema` — the contract a running page reads it
 * with — so a producer/consumer mismatch fails the build.
 *
 * Core is imported by relative path, not as `@clc/core`: the Vite config
 * bundler compiles relative imports but hands workspace packages to Node, and
 * Node can only load core's TypeScript where it strips types. Admin's Pages
 * project builds from `apps/admin`, beyond the root `.node-version`, on a Node
 * that does not.
 *
 * `buildId` is a digest of the build's inputs, not of its commit: git tree and
 * blob IDs for the app and every shared input, the app's release entry and its
 * resolved public configuration. A Pages retry, an identical rebuild or a
 * commit that touches only the other app keeps it, so those users are not told
 * to update to the same code.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  APP_BUILD_INFO_PATH,
  type AppBuildInfo,
  appBuildInfoSchema,
} from "../packages/core/src/features/app-updates/logic.ts";
import { type Brand, resolveBrand } from "../packages/core/src/lib/constants/brand.ts";
import { resolveChainId } from "../packages/core/src/lib/constants/chains.ts";
import { type AppName, type ReleaseFile, readReleaseFile } from "./release.ts";

export { APP_BUILD_INFO_PATH };

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

/**
 * Inputs every app build reads. `packages` is deliberately whole: narrowing it
 * per app needs a verified dependency inventory, and an over-broad input only
 * costs an unneeded banner.
 */
const SHARED_INPUTS = [
  ".node-version",
  ".npmrc",
  "package.json",
  "packages",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tooling",
  "tsconfig.json",
];

/** `apps/admin` carries its own Wrangler config; web's sits at the root. */
const APP_INPUTS: Record<AppName, readonly string[]> = {
  web: ["apps/web", "lingui.config.ts", "wrangler.toml"],
  admin: ["apps/admin"],
};

export interface BuildInfoOptions {
  app: AppName;
  /** Vite's command. A dev server's build carries the `development` marker. */
  command: "build" | "serve";
  /**
   * Every `VITE_` value Vite inlines into this build. Public by construction —
   * Vite ships them to the browser — so hashing them exposes nothing. Brand and
   * chain are resolved from it exactly as the app resolves them at runtime.
   */
  publicEnv: Record<string, string>;
  /** Overridable for tests. */
  processEnv?: NodeJS.ProcessEnv;
  now?: () => Date;
  readGit?: (paths: readonly string[]) => GitState | undefined;
  release?: ReleaseFile;
}

export interface GitState {
  head: string;
  /** Repo-relative path → tree or blob ID at HEAD. */
  objects: Record<string, string>;
  /** Whether the working tree differs from HEAD under any input path. */
  dirty: boolean;
}

export interface AppBuild {
  buildInfo: AppBuildInfo;
  /** The deploy brand, also needed by web's worker build on a dev server. */
  brand: Brand;
}

export function resolveAppBuild(options: BuildInfoOptions): AppBuild {
  const brand = resolveBrand(options.publicEnv.VITE_BRAND);
  const chainId = resolveChainId(options.publicEnv.VITE_CHAIN_ID);
  const processEnv = options.processEnv ?? process.env;
  const now = options.now ?? (() => new Date());
  const readGit = options.readGit ?? readGitState;

  // A Pages build is a deployment: anything it cannot identify ships a page
  // that can never recognise its own successor, so it fails instead.
  const deployment = processEnv.CF_PAGES === "1";
  const release = (options.release ?? readReleaseFile())[options.app];
  const inputs = [...SHARED_INPUTS, ...APP_INPUTS[options.app]].sort();
  const git = readGit(inputs);
  const missing = git ? inputs.filter((input) => !(input in git.objects)) : inputs;

  const claimed = processEnv.CF_PAGES_COMMIT_SHA || processEnv.GITHUB_SHA || undefined;
  const problems: string[] = [];
  if (!git) problems.push("git is unavailable, so the source cannot be identified");
  if (git && missing.length > 0) problems.push(`not committed: ${missing.join(", ")}`);
  if (git?.dirty) problems.push("the working tree differs from HEAD under the build inputs");
  if (git && claimed && claimed !== git.head) {
    problems.push(`the build claims commit ${claimed} but the checkout is ${git.head}`);
  }
  if (deployment && !claimed) problems.push("CF_PAGES_COMMIT_SHA is not set");
  if (deployment && problems.length > 0) {
    throw new Error(
      `[build-info] cannot identify this ${options.app} build: ${problems.join("; ")}`,
    );
  }
  for (const problem of problems) console.warn(`[build-info] ${options.app}: ${problem}`);

  const builtAt = now().toISOString();
  const dirty = problems.length > 0;
  const environment = options.command === "serve" ? "development" : brand;

  const buildId = createHash("sha256")
    .update(
      JSON.stringify({
        schemaVersion: 1,
        app: options.app,
        environment,
        chainId,
        release: { version: release.version, buildNumber: release.buildNumber },
        sources: sortedEntries(git?.objects ?? {}),
        publicEnv: sortedEntries(options.publicEnv),
        // HEAD's object IDs do not describe a working tree that differs from
        // it, so such a build has no stable identity and is never "the same".
        ...(dirty ? { builtAt } : {}),
      }),
    )
    .digest("hex");

  const buildInfo = appBuildInfoSchema.parse({
    schemaVersion: 1,
    app: options.app,
    environment,
    chainId,
    version: release.version,
    buildNumber: release.buildNumber,
    // `minimumBuild` is policy, not identity: publishing a new floor must not
    // also tell already-supported pages that their code changed.
    minimumBuild: release.minimumBuild,
    gitSha: git?.head ?? claimed ?? "unknown",
    dirty,
    builtAt,
    buildId,
  });
  return { buildInfo, brand };
}

/**
 * Writes the descriptor into the finished static output.
 *
 * A Nitro module rather than `hooks: { compiled }`, which in the pinned Nitro
 * replaces the Pages preset's own hook — the one that writes `_routes.json`,
 * `_headers` and the Wrangler config. Module hooks run after the preset's, so
 * the preset never lists this file among its static routes: each app's config
 * excludes the path explicitly.
 */
export function buildInfoNitroModule(info: AppBuildInfo) {
  return {
    name: "clc-build-info",
    setup(nitro: NitroLike) {
      if (nitro.options.dev) return;
      nitro.hooks.hook("compiled", async () => {
        await writeFile(
          path.join(nitro.options.output.publicDir, APP_BUILD_INFO_PATH),
          `${JSON.stringify(info, null, 2)}\n`,
        );
      });
    },
  };
}

/** The slice of Nitro this uses. `nitro/types` does not resolve from the repo root. */
interface NitroLike {
  options: { dev: boolean; output: { publicDir: string } };
  hooks: { hook(name: "compiled", handler: () => Promise<void>): unknown };
}

function readGitState(paths: readonly string[]): GitState | undefined {
  const git = (args: string[]) =>
    execFileSync("git", args, {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });

  try {
    const head = git(["rev-parse", "HEAD"]).trim();
    const objects: Record<string, string> = {};
    // `<mode> <type> <id>\t<path>`; a path absent from HEAD is simply omitted.
    // Tree IDs only need HEAD's own objects, so a shallow clone suffices.
    for (const line of git(["ls-tree", "HEAD", "--", ...paths]).split("\n")) {
      const [meta, file] = line.split("\t");
      const id = meta?.split(" ")[2];
      if (file && id) objects[file] = id;
    }
    const dirty = git(["status", "--porcelain", "--", ...paths]).trim() !== "";
    return { head, objects, dirty };
  } catch {
    return undefined;
  }
}

function sortedEntries(record: Record<string, string>): [string, string][] {
  return Object.entries(record).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}
