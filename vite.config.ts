import { defineConfig } from "vite-plus";

const SPINNER_MESSAGE =
  "Use Spinner from #/components/ui/spinner, or Button's pending, so every wait looks the same and stops under reduced motion.";

// apps/web's own import bans. Oxlint keeps only the last matching override's
// options for a rule, so the features/*/ui override restates these rather than
// dropping them for every file it matches.
const webRestrictedImports = {
  paths: [
    {
      name: "@clc/api/client/create-clc-api",
      message: "Use the exact #/lib/api/<resource> module so web route splitting is preserved.",
    },
    {
      name: "@clc/api/features/admin",
      message: "Admin endpoints belong to apps/admin, never apps/web.",
    },
    { name: "react-icons/fi", importNames: ["FiLoader"], message: SPINNER_MESSAGE },
    { name: "react-icons/im", importNames: ["ImSpinner2"], message: SPINNER_MESSAGE },
    { name: "lucide-react", importNames: ["LoaderCircle", "Loader2"], message: SPINNER_MESSAGE },
  ],
  patterns: [
    {
      group: [
        "**/web/src/**",
        "**/admin/src/**",
        "@clc/web",
        "@clc/web/**",
        "@clc/admin",
        "@clc/admin/**",
      ],
      message: "Apps must not import each other. Move shared logic to @clc/core or @clc/api.",
    },
    {
      group: ["@clc/api/features/admin/**"],
      message: "Admin endpoints belong to apps/admin, never apps/web.",
    },
  ],
};

const featureUiPattern = {
  group: ["#/features/*/ui", "#/features/*/ui/**", "@/features/*/ui", "@/features/*/ui/**"],
  message:
    "Don't import another feature's ui/ — cross-feature reuse goes through logic/ or components/ui/. Sibling files in the same feature use relative paths.",
};

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
        // Shared API layer: HTTP clients + queryOptions factories consumed by
        // every app. React is allowed here (hooks may live alongside the
        // factories) but nothing platform-specific may be.
        files: ["packages/api/src/**"],
        rules: {
          "no-restricted-imports": [
            "error",
            {
              paths: [
                {
                  name: "react-dom",
                  message: "DOM is web-only. Move to an app's components/ or features/*/ui/.",
                },
                {
                  name: "lucide-react",
                  message: "Icons are web-only. Move to an app.",
                },
                {
                  name: "sonner",
                  message: "sonner is web-only. Call toast from ui/ after the query resolves.",
                },
              ],
              patterns: [
                {
                  group: [
                    "@tanstack/react-router",
                    "@tanstack/react-router/**",
                    "@tanstack/react-start",
                    "@tanstack/react-start/**",
                  ],
                  message:
                    "Routing is app-specific. Pass route params/state into the factories as plain args.",
                },
                {
                  group: ["@base-ui/react", "@base-ui/react/**", "react-icons", "react-icons/**"],
                  message: "UI libraries are app-only.",
                },
                {
                  group: ["serwist", "@serwist/**"],
                  message: "Serwist runs in service workers — web-only.",
                },
                {
                  group: ["#/*", "@/*"],
                  message:
                    "App-private aliases don't resolve here. Use relative paths or @clc/core.",
                },
              ],
            },
          ],
        },
      },
      {
        // The apps are independently deployable and must never reach into each
        // other. Shared code goes through @clc/core (pure) or @clc/api (network).
        files: ["apps/admin/src/**"],
        rules: {
          "no-restricted-imports": [
            "error",
            {
              patterns: [
                {
                  // Matches the literal specifier, not the resolved path, so the
                  // relative-traversal forms are listed explicitly: `../../web/src/x`
                  // from apps/admin is exactly how this leak happens.
                  group: [
                    "**/web/src/**",
                    "**/admin/src/**",
                    "@clc/web",
                    "@clc/web/**",
                    "@clc/admin",
                    "@clc/admin/**",
                  ],
                  message:
                    "Apps must not import each other. Move shared logic to @clc/core or @clc/api.",
                },
              ],
            },
          ],
        },
      },
      {
        // Web keeps backend resources route-scoped. The aggregate and admin
        // client are valid in the desktop console, never in the mobile graph.
        // The old loader icons are banned too: waiting is drawn by Spinner.
        files: ["apps/web/src/**"],
        rules: {
          "no-restricted-imports": ["error", webRestrictedImports],
        },
      },
      {
        files: ["apps/web/src/features/*/ui/**"],
        rules: {
          "no-restricted-imports": [
            "error",
            {
              paths: webRestrictedImports.paths,
              patterns: [...webRestrictedImports.patterns, featureUiPattern],
            },
          ],
        },
      },
      {
        files: ["apps/admin/src/features/*/ui/**"],
        rules: {
          "no-restricted-imports": ["error", { patterns: [featureUiPattern] }],
        },
      },
    ],
  },
  test: {
    // Coverage belongs to the workspace run; project-level settings are ignored.
    coverage: {
      provider: "v8",
      reporter: ["lcov", "json", "json-summary", "text-summary"],
      reportsDirectory: "./coverage",
      include: [
        "apps/*/src/**/*.{ts,tsx}",
        "packages/{api,core}/src/**/*.{ts,tsx}",
        "tooling/**/*.ts",
      ],
      exclude: ["**/*.test.{ts,tsx}", "**/*.d.ts", "**/routeTree.gen.ts", "**/vitest.config.ts"],
    },
    projects: [
      "apps/admin/vitest.config.ts",
      "apps/web/vitest.config.ts",
      "packages/api/vitest.config.ts",
      "packages/core/vitest.config.ts",
      "tooling/vitest.config.ts",
    ],
  },
});
