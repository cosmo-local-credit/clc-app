import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { codecovVitePlugin } from "@codecov/vite-plugin";
import { lingui } from "@lingui/vite-plugin";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, loadEnv } from "vite-plus";
import {
  APP_BUILD_INFO_PATH,
  buildInfoNitroModule,
  resolveAppBuild,
} from "../../tooling/build-info.ts";
import { serwistNitroModule, tanstackSerwistPlugin } from "./plugins/serwist";

const webRoot = dirname(fileURLToPath(import.meta.url));

function loadWranglerViteVars(localEnv: Record<string, string>) {
  const configPath = resolve(webRoot, "../../wrangler.toml");
  let activeSection = "";
  let config = "";
  try {
    config = readFileSync(configPath, "utf8");
  } catch {
    return;
  }

  for (const rawLine of config.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const section = line.match(/^\[([^\]]+)\]$/);
    if (section) {
      activeSection = section[1] ?? "";
      continue;
    }

    // Off Cloudflare, fill gaps from staging: `[vars]` holds prod's values, and
    // a laptop or CI build must never default to the prod backend.
    if (activeSection !== "env.preview.vars") continue;

    const match = line.match(/^(VITE_[A-Z0-9_]+)\s*=\s*"([^"]*)"$/);
    if (!match) continue;

    const [, key, value] = match;
    if (key && value !== undefined && !process.env[key] && !localEnv[key]) {
      process.env[key] = value;
    }
  }
}

const config = defineConfig(({ mode, command }): import("vite-plus").UserConfig => {
  const localEnv = loadEnv(mode, webRoot, "VITE_");
  loadWranglerViteVars(localEnv);

  const fullReactErrors =
    (process.env.VITE_FULL_REACT_ERRORS ?? localEnv.VITE_FULL_REACT_ERRORS) === "true";
  const environments = fullReactErrors
    ? {
        client: {
          build: { minify: false, sourcemap: true },
          define: { "process.env.NODE_ENV": JSON.stringify("development") },
        },
      }
    : undefined;

  const { buildInfo, brand } = resolveAppBuild({
    app: "web",
    command,
    // Read again after the Wrangler vars are applied: this is what Vite inlines.
    publicEnv: loadEnv(mode, webRoot, "VITE_"),
  });

  const plugins: import("vite-plus").PluginOption[] = [
    ...(command === "serve" ? [devtools()] : []),
    // `plugins/` is Nitro's runtime-plugin convention, but this file is a Vite
    // build plugin. Keep it out of Nitro's server scan without moving the path
    // used by the web build and repository tooling.
    //
    // Flat, not nested under `config`: the pinned nightly declares
    // `NitroPluginConfig extends NitroConfig`, so its options sit at the top
    // level. A later nightly moves them back under `config` — if this line stops
    // type-checking after a bump, that is which shape changed, not what it means.
    nitro({
      ignore: ["plugins/serwist.ts"],
      // The descriptor joins the static output with `public/`; the worker is
      // built against that output (excluding the descriptor from its precache)
      // before Nitro builds the server and indexes its static files.
      modules: [buildInfoNitroModule(buildInfo), serwistNitroModule({ brand, buildInfo })],
      // A path missing from the Pages routes exclusions reaches the SSR
      // Function, which answers with HTML. The preset lists static files itself
      // but truncates the list at 100 rules; configured entries come first.
      cloudflare: { pages: { routes: { exclude: [APP_BUILD_INFO_PATH, "/sw.js"] } } },
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    babel({ plugins: ["@lingui/babel-plugin-lingui-macro"] }),
    lingui(),
    tanstackSerwistPlugin({ brand, buildInfo }),
    codecovVitePlugin({
      enableBundleAnalysis: process.env.CI === "true",
      bundleName: "clc-web-client",
      uploadToken: process.env.CODECOV_TOKEN,
      gitService: "github",
    }).map((plugin): import("vite-plus").Plugin => ({
      ...plugin,
      // Client, SSR and Nitro all emit ESM. Sharing one report name lets a
      // server upload replace the browser assets and creates false regressions.
      applyToEnvironment: (environment) => environment.name === "client",
    })),
  ];

  return {
    // Client, SSR and Nitro share one serialized copy. The worker is compiled
    // separately with `configFile: false` and gets the same object explicitly.
    define: { __CLC_BUILD_INFO__: JSON.stringify(buildInfo) },
    environments,
    resolve: { tsconfigPaths: true },
    plugins,
  };
});

export default config;
