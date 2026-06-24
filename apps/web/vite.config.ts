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
import { tanstackSerwistPlugin } from "./plugins/serwist";

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

    if (activeSection !== "vars") continue;

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

  const plugins: import("vite-plus").PluginOption[] = [
    ...(command === "serve" ? [devtools()] : []),
    nitro(),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    babel({ plugins: ["@lingui/babel-plugin-lingui-macro"] }),
    lingui(),
    tanstackSerwistPlugin(),
    codecovVitePlugin({
      enableBundleAnalysis: process.env.CI === "true",
      bundleName: "clc-web",
      uploadToken: process.env.CODECOV_TOKEN,
      gitService: "github",
    }),
  ];

  return { environments, resolve: { tsconfigPaths: true }, plugins };
});

export default config;
