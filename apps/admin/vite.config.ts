import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite-plus";

// Desktop admin console. Deliberately leaner than apps/web: no Serwist (this is
// not a PWA and must never register a service worker), no lingui (English-only
// back office), no wrangler var loading.
export default defineConfig(({ command }): import("vite-plus").UserConfig => {
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
