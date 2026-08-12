import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, loadEnv, type Plugin } from "vite-plus";
import { assertAuthIsDeployable } from "./src/features/auth/build-guard";

/**
 * Refuses to produce a production bundle while admin authentication is stubbed.
 *
 * The check runs in `buildStart` rather than while the config is being evaluated.
 * Throwing at config load would break every tool that merely *reads* this file —
 * knip did exactly that — even though no build was being attempted.
 */
function stubAuthGuard(mode: string): Plugin {
  return {
    name: "clc-admin:stub-auth-guard",
    apply: "build",
    buildStart() {
      assertAuthIsDeployable({
        command: "build",
        mode,
        env: { ...loadEnv(mode, import.meta.dirname, "VITE_"), ...process.env },
      });
    },
  };
}

// Desktop admin console. Deliberately leaner than apps/web: no Serwist (this is
// not a PWA and must never register a service worker), no lingui (English-only
// back office), no wrangler var loading.
export default defineConfig(({ command, mode }): import("vite-plus").UserConfig => {
  return {
    resolve: { tsconfigPaths: true },
    plugins: [
      ...(command === "serve" ? [devtools()] : []),
      stubAuthGuard(mode),
      nitro(),
      tailwindcss(),
      tanstackStart(),
      viteReact(),
    ],
  };
});
