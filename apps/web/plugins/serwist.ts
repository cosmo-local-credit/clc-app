import path from "node:path";
import type { AppBuildInfo } from "@clc/core/features/app-updates/logic";
import { injectManifest } from "@serwist/build";
import type { NitroModule } from "nitro/types";
import { build, type Plugin } from "vite-plus";

type Brand = "prod" | "staging";

interface WorkerBuildOptions {
  brand: Brand;
  /** The app build's identity, inlined so QA can read it from the worker. */
  buildInfo: AppBuildInfo;
}

/**
 * Development worker, written into `public/` so the dev server serves it. The
 * production worker is built by {@link serwistNitroModule} instead.
 */
export function tanstackSerwistPlugin({ brand, buildInfo }: WorkerBuildOptions): Plugin {
  let rootDir: string;
  let isProduction: boolean;

  return {
    name: "tanstack-serwist",
    configResolved(config) {
      rootDir = config.root;
      isProduction = config.isProduction;
    },
    async buildStart() {
      if (!isProduction) {
        await buildServiceWorker({
          rootDir,
          outDir: path.resolve(rootDir, "public"),
          production: false,
          brand,
          buildInfo,
        });
      }
    },
  };
}

/**
 * Production worker, built once Nitro has finished writing the output.
 *
 * A Vite `closeBundle` hook used to own this, but it fires once per environment
 * and the client environment's call lands before Nitro copies `public/` into
 * the output, so which pass produced the shipped `sw.js` — and therefore what it
 * precached — depended on build order. Nitro's `compiled` hook runs after the
 * public copy and the server build, and its `output.publicDir` is the resolved
 * static directory for every preset (`dist/` on Pages, `.output/public/`
 * locally), so no preset sniffing is needed.
 *
 * Registered as a module rather than through `hooks: { compiled }`: the pinned
 * Nitro merges that option over the preset's own `compiled` hook, and the Pages
 * preset writes `_routes.json`, `_headers` and the Wrangler config from it.
 * Module hooks are appended after the preset's. That ordering also means the
 * preset scans the output before this file exists, so `/sw.js` has to be an
 * explicit routes exclusion in the Nitro config.
 */
export function serwistNitroModule({ brand, buildInfo }: WorkerBuildOptions): NitroModule {
  return {
    name: "clc-serwist",
    setup(nitro) {
      if (nitro.options.dev) return;
      nitro.hooks.hook("compiled", async () => {
        await buildServiceWorker({
          rootDir: nitro.options.rootDir,
          outDir: nitro.options.output.publicDir,
          production: true,
          brand,
          buildInfo,
        });
      });
    },
  };
}

async function buildServiceWorker({
  rootDir,
  outDir,
  production,
  brand,
  buildInfo,
}: WorkerBuildOptions & {
  rootDir: string;
  outDir: string;
  production: boolean;
}) {
  const outName = "sw.js";
  const swSrc = path.resolve(rootDir, "src", "sw.ts");
  const swDest = path.resolve(outDir, outName);
  const env = production ? "production" : "dev";

  console.log(`\n[serwist] building service worker (${env})...`);

  try {
    await build({
      root: rootDir,
      configFile: false,
      // Vite copies `public/` into `outDir` by default. Here `outDir` is the
      // finished output, so the copy would overwrite the `_headers` the Pages
      // preset has just generated with the checked-in source and drop the
      // immutable `/assets/*` rule.
      publicDir: false,
      define: {
        "process.env.NODE_ENV": JSON.stringify(production ? "production" : "development"),
        // The app config's `define` does not reach a `configFile: false` build.
        __CLC_BUILD_INFO__: JSON.stringify(buildInfo),
      },
      build: {
        lib: {
          entry: swSrc,
          formats: ["es"],
          fileName: () => outName,
        },
        outDir,
        emptyOutDir: false,
        minify: production,
        rollupOptions: {
          output: {
            entryFileNames: outName,
          },
        },
      },
      logLevel: "error",
    });

    if (production) {
      const result = await injectManifest({
        swSrc: swDest,
        swDest,
        globDirectory: outDir,
        globPatterns: ["**/*.{js,css,html,png,svg,ico,webmanifest}"],
        // _worker.js/ is the Cloudflare Pages server bundle — not a static asset.
        // Large route/vendor chunks and fonts are better fetched on demand on slow
        // connections; the browser cache will keep what the user actually visits.
        // Keep the install dialog genuinely on demand, even when small enough
        // to fit under the precache limit. Installed users rarely need it.
        globIgnores: [
          "_worker.js/**",
          "**/install-app-dialog-*.js",
          // Native QR scanning never needs the ZXing fallback. Keep its JS on
          // demand too; .wasm is already outside globPatterns above.
          "**/qr-zxing-*.js",
          // Both brands' icon sets ship so develop and master keep identical
          // trees, but only the one this build resolved is ever requested.
          `brand/${brand === "staging" ? "prod" : "staging"}/**`,
          `manifest.${brand === "staging" ? "prod" : "staging"}.webmanifest`,
          // The deployment descriptor must always come from the network. JSON
          // is outside globPatterns today; this keeps it out if that changes.
          "build-info.json",
        ],
        maximumFileSizeToCacheInBytes: 300 * 1024,
        injectionPoint: "self.__SW_MANIFEST",
      });

      const cacheSize = (result.size / 1024 / 1024).toFixed(2);
      console.log(`[serwist] precached ${result.count} files (${cacheSize} MB)`);
    } else {
      console.log("[serwist] dev service worker built");
    }
  } catch (error) {
    console.error("[serwist] failed to build service worker:", error);
    throw error;
  }
}
