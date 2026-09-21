import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite-plus";

/**
 * `public/manifest.json` is copied as-is, so its `theme_color` cannot read
 * `VITE_BRAND`. Patch it in dev and at the end of the production copy so the
 * install splash matches the status-bar meta.
 */
export function brandManifestPlugin(themeColor: string): Plugin {
  let rootDir = "";
  let isProduction = false;

  return {
    name: "brand-manifest-theme-color",
    configResolved(config) {
      rootDir = config.root;
      isProduction = config.isProduction;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0];
        if (url !== "/manifest.json") {
          next();
          return;
        }
        const file = path.join(server.config.publicDir, "manifest.json");
        if (!existsSync(file)) {
          next();
          return;
        }
        const body = withThemeColor(readFileSync(file, "utf8"), themeColor);
        res.setHeader("Content-Type", "application/manifest+json");
        res.end(body);
      });
    },
    closeBundle() {
      if (!isProduction) return;
      const outDir = publicOutputDir(rootDir);
      const file = path.join(outDir, "manifest.json");
      if (!existsSync(file)) return;
      writeFileSync(file, withThemeColor(readFileSync(file, "utf8"), themeColor));
    },
  };
}

function publicOutputDir(rootDir: string): string {
  const isCfPages =
    process.env.NITRO_PRESET === "cloudflare-pages" || Boolean(process.env.CF_PAGES);
  return isCfPages ? path.resolve(rootDir, "dist") : path.resolve(rootDir, ".output", "public");
}

function withThemeColor(source: string, themeColor: string): string {
  const manifest = JSON.parse(source) as { theme_color?: string };
  manifest.theme_color = themeColor;
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
