import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  fmt: {
    ignorePatterns: [
      "**/routeTree.gen.ts",
      "**/styles.css",
      "**/dist/**",
      "**/.output/**",
      "packages/i18n/src/catalogs/**",
      // Serwist output — gitignored, so it exists locally but never in CI.
      "apps/web/public/sw.js",
    ],
  },
  lint: {
    jsPlugins: [
      { name: "vite-plus", specifier: "vite-plus/oxlint-plugin" },
      "eslint-plugin-better-tailwindcss",
    ],
    settings: {
      "better-tailwindcss": {
        entryPoint: "apps/web/src/styles.css",
      },
    },
    rules: {
      "vite-plus/prefer-vite-plus-imports": "error",
      "better-tailwindcss/enforce-consistent-class-order": "error",
      "better-tailwindcss/no-conflicting-classes": "error",
      "better-tailwindcss/no-duplicate-classes": "warn",
      "better-tailwindcss/no-unnecessary-whitespace": "warn",
    },
    options: { typeAware: true, typeCheck: true },
    ignorePatterns: [
      "**/routeTree.gen.ts",
      "**/dist/**",
      "**/.output/**",
      "packages/i18n/src/catalogs/**",
      "apps/web/public/sw.js",
    ],
    overrides: [
      {
        files: ["packages/core/src/**"],
        rules: {
          "no-restricted-imports": [
            "error",
            {
              paths: [
                {
                  name: "react",
                  message:
                    "Platform-agnostic zone: don't import react directly. Use RN-compatible libs (zustand, @tanstack/react-form, @tanstack/react-query) instead.",
                },
                {
                  name: "react-dom",
                  message: "DOM is web-only. Move to apps/web/src/components/ or features/*/ui/.",
                },
                {
                  name: "react-dom/client",
                  message: "DOM is web-only. Move to apps/web/src/components/ or features/*/ui/.",
                },
                {
                  name: "react-dom/server",
                  message: "DOM is web-only. Move to apps/web/src/components/ or features/*/ui/.",
                },
                {
                  name: "lucide-react",
                  message: "Icons are web-only. Move to apps/web/.",
                },
                {
                  name: "maplibre-gl",
                  message: "MapLibre is a browser map renderer. Keep map UI in apps/web/.",
                },
                {
                  name: "sonner",
                  message: "sonner is web-only. Call toast from ui/ after logic/ resolves.",
                },
              ],
              patterns: [
                {
                  group: [
                    "@tanstack/react-router",
                    "@tanstack/react-router/**",
                    "@tanstack/react-router-devtools",
                    "@tanstack/react-router-ssr-query",
                  ],
                  message:
                    "Routing is platform-specific. Pass route params/state into logic/ as plain args.",
                },
                {
                  group: [
                    "@tanstack/react-start",
                    "@tanstack/react-start/**",
                    "@tanstack/react-devtools",
                    "@tanstack/devtools-vite",
                  ],
                  message:
                    "TanStack Start is a web framework. Server functions live outside packages/core/.",
                },
                {
                  group: ["@base-ui/react", "@base-ui/react/**"],
                  message: "Base UI is web-only. Move to apps/web/.",
                },
                {
                  group: ["react-icons", "react-icons/**"],
                  message: "react-icons is web-only. Icons belong in apps/web/.",
                },
                {
                  group: ["serwist", "@serwist/**"],
                  message: "Serwist runs in service workers — web-only.",
                },
                {
                  group: ["#/components", "#/components/**", "@/components", "@/components/**"],
                  message:
                    "components/ is web-only UI. Don't import it from platform-agnostic code.",
                },
              ],
            },
          ],
        },
      },
      {
        files: ["apps/web/src/features/*/ui/**"],
        rules: {
          "no-restricted-imports": [
            "error",
            {
              patterns: [
                {
                  group: [
                    "#/features/*/ui",
                    "#/features/*/ui/**",
                    "@/features/*/ui",
                    "@/features/*/ui/**",
                  ],
                  message:
                    "Don't import another feature's ui/ — cross-feature reuse goes through logic/ or components/ui/. Sibling files in the same feature use relative paths.",
                },
              ],
            },
          ],
        },
      },
    ],
  },
  test: {
    projects: ["apps/web/vitest.config.ts", "packages/core/vitest.config.ts"],
  },
});
