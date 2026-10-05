import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
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

const adminRoot = dirname(fileURLToPath(import.meta.url));

// Desktop admin console. Deliberately leaner than apps/web: no Serwist (this is
// not a PWA and must never register a service worker), no lingui (English-only
// back office), no wrangler var loading.
export default defineConfig(({ command, mode }): import("vite-plus").UserConfig => {
  const { buildInfo } = resolveAppBuild({
    app: "admin",
    command,
    // What Vite inlines: Pages supplies `[vars]` through the process
    // environment, a laptop build reads `.env`.
    publicEnv: loadEnv(mode, adminRoot, "VITE_"),
  });

  return {
    // The port belongs here rather than only in the `dev` script, so that
    // `vp dev apps/admin` from the repo root lands on 3001 too — it used to fall
    // back to Vite's default and quietly take apps/web's port. strictPort makes
    // the collision an error: clc-core's CORS and WebAuthn origin allowlists name
    // this port, so a console served from another one fails at sign-in instead of
    // at startup.
    server: { port: 3001, strictPort: true },
    define: { __CLC_BUILD_INFO__: JSON.stringify(buildInfo) },
    resolve: { tsconfigPaths: true },
    plugins: [
      ...(command === "serve" ? [devtools()] : []),
      nitro({
        modules: [buildInfoNitroModule(buildInfo)],
        // The Pages preset lists static files as routes exclusions before
        // module hooks write the descriptor. Unlisted, the path reaches the SSR
        // Function and answers with HTML; configured entries survive the
        // preset's 100-rule cap.
        cloudflare: { pages: { routes: { exclude: [APP_BUILD_INFO_PATH] } } },
      }),
      tailwindcss(),
      tanstackStart(),
      viteReact(),
    ],
  };
});
