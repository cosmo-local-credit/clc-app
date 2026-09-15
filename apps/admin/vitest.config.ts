import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [viteReact()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // The console's heaviest screens — the map-backed pool publish flow, the
    // data tables — drive several query-backed steps per test, and under a full
    // four-project run they contend for workers. The publish flow measured
    // ~5.6s that way against Vitest's 5s default while passing on its own, so
    // the suite was failing on scheduling rather than on behaviour.
    testTimeout: 20_000,
    coverage: {
      provider: "v8",
      reporter: ["lcov", "text", "json-summary"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/**/*.d.ts", "src/routeTree.gen.ts"],
    },
  },
});
