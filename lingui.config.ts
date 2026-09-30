import { defineConfig } from "@lingui/cli";

export default defineConfig({
  sourceLocale: "en",
  locales: ["ar", "dz", "en", "es", "fr", "it", "pt", "sr", "sw"],
  catalogs: [
    {
      // Anchor to <rootDir> (absolute) so the @lingui/vite-plugin catalog loader
      // resolves correctly regardless of process.cwd. Vitest and the per-package
      // build (pnpm --filter) run from apps/web, not the repo root.
      path: "<rootDir>/packages/i18n/src/catalogs/{locale}/messages",
      include: ["<rootDir>/apps/web/src", "<rootDir>/packages/i18n/src"],
      exclude: ["**/*.test.ts", "**/*.test.tsx"],
    },
  ],
});
