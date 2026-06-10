import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { lingui } from "@lingui/vite-plugin";
import babel from "@rolldown/plugin-babel";
import viteReact from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vite-plus";

// Vitest runs from apps/web, but lingui.config.ts and the catalogs it references
// live at the repo root. Point the plugin at the root config so its rootDir
// resolves there (dev/build already run from the repo root, so they don't need this).
const linguiConfigPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../lingui.config.ts");

export default defineConfig({
  // lingui() returns a Plugin[]; spread it so each plugin is a top-level entry
  // (avoids a nested-array type clash with vite-plus's plugin option type).
  plugins: [
    viteReact(),
    babel({ plugins: ["@lingui/babel-plugin-lingui-macro"] }),
    ...lingui({ configPath: linguiConfigPath }),
  ],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // Playwright e2e specs live in e2e/ — keep them out of the unit runner.
    exclude: [...configDefaults.exclude, "e2e/**"],
    deps: {
      optimizer: {
        ssr: { enabled: true },
      },
    },
    coverage: {
      provider: "v8",
      reporter: ["lcov", "text", "json-summary"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/**/*.d.ts", "src/routeTree.gen.ts"],
    },
  },
});
