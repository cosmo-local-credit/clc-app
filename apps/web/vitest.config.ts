import { defineConfig } from "vitest/config";
import viteReact from "@vitejs/plugin-react";

export default defineConfig({
	plugins: [viteReact()],
	resolve: {
		tsconfigPaths: true,
	},
	test: {
		environment: "jsdom",
		setupFiles: ["./vitest.setup.ts"],
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
