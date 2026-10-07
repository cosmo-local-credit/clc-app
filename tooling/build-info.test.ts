import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vite-plus/test";
import { appBuildInfoSchema } from "../packages/core/src/features/app-updates/logic.ts";
import {
  type BuildInfoOptions,
  buildInfoNitroModule,
  type GitState,
  resolveAppBuild,
} from "./build-info.ts";
import type { ReleaseFile } from "./release.ts";

const HEAD = "0123456789abcdef0123456789abcdef01234567";

const release: ReleaseFile = {
  web: { version: "0.1.0", buildNumber: 2, minimumBuild: 1 },
  admin: { version: "0.3.0", buildNumber: 5, minimumBuild: 0 },
};

const objects: Record<string, string> = {
  ".node-version": "o1",
  ".npmrc": "o2",
  "apps/admin": "admin-tree",
  "apps/web": "web-tree",
  "lingui.config.ts": "o3",
  "package.json": "o4",
  packages: "packages-tree",
  "pnpm-lock.yaml": "lock",
  "pnpm-workspace.yaml": "o5",
  tooling: "tooling-tree",
  "tsconfig.json": "o6",
  "wrangler.toml": "wrangler",
};

/** Answers like `git ls-tree`: only the requested paths that exist at HEAD. */
function gitAt(overrides: Partial<GitState> = {}) {
  return (paths: readonly string[]): GitState => {
    const all = overrides.objects ?? objects;
    return {
      head: HEAD,
      dirty: false,
      ...overrides,
      objects: Object.fromEntries(
        paths.filter((path) => path in all).map((path) => [path, all[path]]),
      ),
    };
  };
}

function resolve(overrides: Partial<BuildInfoOptions> = {}) {
  return resolveAppBuild({
    app: "web",
    command: "build",
    publicEnv: { VITE_API_URL: "https://api.example", VITE_BRAND: "staging" },
    processEnv: {},
    now: () => new Date("2026-10-05T09:00:00.000Z"),
    readGit: gitAt(),
    release,
    ...overrides,
  }).buildInfo;
}

describe("resolveBuildInfo", () => {
  it("produces what the running page accepts", () => {
    const info = resolve();
    expect(appBuildInfoSchema.parse(info)).toEqual(info);
    expect(info).toMatchObject({
      app: "web",
      environment: "staging",
      version: "0.1.0",
      buildNumber: 2,
      minimumBuild: 1,
      gitSha: HEAD,
      dirty: false,
    });
  });

  it("keeps the identity across commits and rebuilds with the same inputs", () => {
    const later = resolve({
      readGit: gitAt({ head: "f".repeat(40) }),
      now: () => new Date("2026-10-07T12:00:00.000Z"),
    });
    expect(later.buildId).toBe(resolve().buildId);
    expect(later.gitSha).not.toBe(resolve().gitSha);
  });

  it.each([
    ["app source", { readGit: gitAt({ objects: { ...objects, "apps/web": "x" } }) }],
    ["shared packages", { readGit: gitAt({ objects: { ...objects, packages: "x" } }) }],
    ["lockfile", { readGit: gitAt({ objects: { ...objects, "pnpm-lock.yaml": "x" } }) }],
    [
      "public configuration",
      { publicEnv: { VITE_API_URL: "https://other.example", VITE_BRAND: "staging" } },
    ],
    ["release milestone", { release: { ...release, web: { ...release.web, buildNumber: 3 } } }],
    ["release label", { release: { ...release, web: { ...release.web, version: "0.2.0" } } }],
  ] satisfies [string, Partial<BuildInfoOptions>][])(
    "changes the identity when the %s changes",
    (_, overrides) => {
      expect(resolve(overrides).buildId).not.toBe(resolve().buildId);
    },
  );

  it("leaves web's identity alone when only admin changes", () => {
    const adminOnly = resolve({
      readGit: gitAt({ objects: { ...objects, "apps/admin": "x" } }),
      release: { ...release, admin: { version: "0.4.0", buildNumber: 6, minimumBuild: 6 } },
    });
    expect(adminOnly.buildId).toBe(resolve().buildId);
  });

  it("publishes a new minimum without changing the identity", () => {
    const floor = resolve({ release: { ...release, web: { ...release.web, minimumBuild: 2 } } });
    expect(floor.minimumBuild).toBe(2);
    expect(floor.buildId).toBe(resolve().buildId);
  });

  it("resolves brand and chain from the public configuration, as the app does", () => {
    expect(resolve()).toMatchObject({ environment: "staging", chainId: 100 });
    expect(resolve({ publicEnv: { VITE_CHAIN_ID: "42220" } })).toMatchObject({
      environment: "prod",
      chainId: 42220,
    });
    expect(() => resolve({ publicEnv: { VITE_BRAND: "stagign" } })).toThrow(/not a brand/);
  });

  it("marks a dev server build", () => {
    expect(resolve({ command: "serve" }).environment).toBe("development");
  });

  it("gives a dirty local build a fresh identity every time", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const dirty = (at: string) =>
      resolve({ readGit: gitAt({ dirty: true }), now: () => new Date(at) });
    const first = dirty("2026-10-05T09:00:00.000Z");
    expect(first.dirty).toBe(true);
    expect(first.buildId).not.toBe(dirty("2026-10-05T09:00:01.000Z").buildId);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("falls back to an unknown commit without git outside a deployment", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const info = resolve({ readGit: () => undefined });
    expect(info).toMatchObject({ gitSha: "unknown", dirty: true });
    expect(appBuildInfoSchema.safeParse(info).success).toBe(true);
    warn.mockRestore();
  });

  describe("on a Pages deployment", () => {
    const pages = { CF_PAGES: "1", CF_PAGES_COMMIT_SHA: HEAD };

    it("identifies a clean checkout", () => {
      expect(resolve({ processEnv: pages })).toMatchObject({ gitSha: HEAD, dirty: false });
    });

    it.each([
      ["git is unavailable", { readGit: () => undefined }],
      ["the tree is dirty", { readGit: gitAt({ dirty: true }) }],
      [
        "an input is uncommitted",
        {
          readGit: (() => {
            const { tooling: _, ...rest } = objects;
            return gitAt({ objects: rest });
          })(),
        },
      ],
      ["the commit is missing", { processEnv: { CF_PAGES: "1" } }],
      ["the commit disagrees", { processEnv: { ...pages, CF_PAGES_COMMIT_SHA: "f".repeat(40) } }],
    ] satisfies [string, Partial<BuildInfoOptions>][])("fails when %s", (_, overrides) => {
      expect(() => resolve({ processEnv: pages, ...overrides })).toThrow(
        /cannot identify this web build/,
      );
    });
  });
});

describe("buildInfoNitroModule", () => {
  // Written before Nitro copies public assets and builds the server, so the
  // Node preset indexes it like any static file instead of answering 404.
  it("publishes the descriptor as an uncached public asset", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "clc-build-info-"));
    const nitro = {
      options: {
        dev: false,
        rootDir,
        buildDir: "node_modules/.nitro",
        publicAssets: [] as { dir: string; baseURL?: string; maxAge?: number }[],
        routeRules: {} as Record<string, { headers?: Record<string, string> }>,
      },
    };
    const info = resolve();

    await buildInfoNitroModule(info).setup(nitro);

    const [asset] = nitro.options.publicAssets;
    expect(asset).toMatchObject({ baseURL: "/", maxAge: 0 });
    const written = await readFile(path.join(asset?.dir ?? "", "build-info.json"), "utf8");
    expect(JSON.parse(written)).toEqual(info);
    expect(nitro.options.routeRules["/build-info.json"]).toEqual({
      headers: { "cache-control": "no-store" },
    });
  });

  it("publishes nothing from a dev server", async () => {
    const nitro = {
      options: { dev: true, rootDir: "/", buildDir: "", publicAssets: [], routeRules: {} },
    };
    await buildInfoNitroModule(resolve()).setup(nitro);
    expect(nitro.options.publicAssets).toEqual([]);
  });
});
