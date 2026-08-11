import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, loadEnv } from "vite-plus";
import { assertAuthIsDeployable } from "./src/features/auth/build-guard";

// Desktop admin console. Deliberately leaner than apps/web: no Serwist (this is
// not a PWA and must never register a service worker), no lingui (English-only
// back office), no wrangler var loading.
export default defineConfig(({ command, mode }): import("vite-plus").UserConfig => {
  // Fails the build rather than shipping a console that authenticates nobody.
  // Reads the resolved env so a value from .env counts, not just process.env.
  assertAuthIsDeployable({
    command,
    mode,
    env: { ...loadEnv(mode, import.meta.dirname, "VITE_"), ...process.env },
  });

  return {
    resolve: { tsconfigPaths: true },
    plugins: [
      ...(command === "serve" ? [devtools()] : []),
      nitro(),
      tailwindcss(),
      tanstackStart(),
      viteReact(),
    ],
  };
});
