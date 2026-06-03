import babel from "@rolldown/plugin-babel";
import viteReact from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		viteReact(),
		babel({ plugins: ["@lingui/babel-plugin-lingui-macro"] }),
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
			exclude: [
				"src/**/*.test.{ts,tsx}",
				"src/**/*.d.ts",
				"src/routeTree.gen.ts",
			],
		},
	},
});
