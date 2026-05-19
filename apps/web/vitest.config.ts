import { defineConfig } from "vitest/config";
import viteReact from "@vitejs/plugin-react";

export default defineConfig({
	plugins: [viteReact()],
	resolve: {
		tsconfigPaths: true,
	},
	test: {
		environment: "jsdom",
		deps: {
			optimizer: {
				ssr: { enabled: true },
			},
		},
	},
});
