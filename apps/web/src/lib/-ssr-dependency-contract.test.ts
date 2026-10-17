import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vite-plus/test";

const REPO = resolve(import.meta.dirname, "../../../..");
const SHARED_PACKAGES = ["packages/core", "packages/api"];

type Manifest = {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

function manifest(path: string): Manifest {
  return JSON.parse(readFileSync(path, "utf8")) as Manifest;
}

/**
 * Vite bundles into the server build any dependency `apps/web` cannot resolve
 * itself, while `react`, which it can, stays external. A dependency that
 * reaches React through CommonJS (`use-sync-external-store`'s
 * `require("react")`, under `@tanstack/react-form`) then keeps a runtime
 * require that Cloudflare's worker cannot satisfy: every page that renders it
 * answers 500 with `No such module "react"`. Declaring the package in
 * `apps/web` keeps it external beside React, and Nitro links the two.
 */
describe("server-rendered dependencies", () => {
  const web = manifest(resolve(REPO, "apps/web/package.json"));
  const declared = new Set(Object.keys({ ...web.dependencies, ...web.peerDependencies }));

  for (const pkg of SHARED_PACKAGES) {
    it(`declares in apps/web every React-bound dependency of ${pkg}`, () => {
      const dependencies = Object.keys(
        manifest(resolve(REPO, pkg, "package.json")).dependencies ?? {},
      );
      const reactBound = dependencies.filter((name) => {
        if (name.startsWith("@clc/")) return false;
        const own = manifest(resolve(REPO, pkg, "node_modules", name, "package.json"));
        return "react" in (own.peerDependencies ?? {});
      });

      expect(reactBound.filter((name) => !declared.has(name))).toEqual([]);
    });
  }
});
