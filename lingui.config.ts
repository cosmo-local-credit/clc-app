import { defineConfig } from "@lingui/cli";

export default defineConfig({
  sourceLocale: "en",
  locales: ["en", "sw"],
  catalogs: [
    {
      path: "packages/i18n/src/catalogs/{locale}/messages",
      include: ["apps/web/src", "packages/i18n/src"],
      exclude: ["**/*.test.ts", "**/*.test.tsx"],
    },
  ],
});
