import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import { tanstackSerwistPlugin } from "./plugins/serwist";

function loadWranglerViteVars() {
	const configPath = resolve(
		dirname(fileURLToPath(import.meta.url)),
		"../../wrangler.toml",
	);
	let activeSection = "";
	let config = "";
	try {
		config = readFileSync(configPath, "utf8");
	} catch {
		return;
	}

	for (const rawLine of config.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;

		const section = line.match(/^\[([^\]]+)\]$/);
		if (section) {
			activeSection = section[1] ?? "";
			continue;
		}

		if (activeSection !== "vars") continue;

		const match = line.match(/^(VITE_[A-Z0-9_]+)\s*=\s*"([^"]*)"$/);
		if (!match) continue;

		const [, key, value] = match;
		if (key && value !== undefined && !process.env[key]) {
			process.env[key] = value;
		}
	}
}

loadWranglerViteVars();

const config = defineConfig({
	resolve: { tsconfigPaths: true },
	plugins: [
		devtools(),
		nitro(),
		tailwindcss(),
		tanstackStart(),
		viteReact(),
		tanstackSerwistPlugin(),
	],
});

export default config;
