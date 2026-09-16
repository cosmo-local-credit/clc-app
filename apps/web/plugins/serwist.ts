import path from "node:path";
import { injectManifest } from "@serwist/build";
import { build, type Plugin } from "vite-plus";

export function tanstackSerwistPlugin(): Plugin {
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
        await buildServiceWorker(rootDir, false);
      }
    },
    async closeBundle() {
      if (isProduction) {
        await buildServiceWorker(rootDir, true);
      }
    },
  };
}

function getPublicOutputDir(rootDir: string, production: boolean): string {
  if (!production) return path.resolve(rootDir, "public");
  // cloudflare-pages preset (set by build:cf or Cloudflare CI) outputs static
  // assets to dist/ rather than .output/public/ used by the node preset.
  const isCfPages =
    process.env.NITRO_PRESET === "cloudflare-pages" || Boolean(process.env.CF_PAGES);
  return isCfPages ? path.resolve(rootDir, "dist") : path.resolve(rootDir, ".output", "public");
}

async function buildServiceWorker(rootDir: string, production: boolean) {
  const outName = "sw.js";
  const outDir = getPublicOutputDir(rootDir, production);
  const swSrc = path.resolve(rootDir, "src", "sw.ts");
  const swDest = path.resolve(outDir, outName);
  const env = production ? "production" : "dev";

  console.log(`\n[serwist] building service worker (${env})...`);

  try {
    await build({
      root: rootDir,
      configFile: false,
      define: {
        "process.env.NODE_ENV": JSON.stringify(production ? "production" : "development"),
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
        globIgnores: ["_worker.js/**", "**/pwa-install.es-*.js"],
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
