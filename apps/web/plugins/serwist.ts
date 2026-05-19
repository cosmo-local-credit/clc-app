import path from "node:path";
import { injectManifest } from "@serwist/build";
import { build, type Plugin } from "vite";

export function tanstackSerwistPlugin(): Plugin {
	let rootDir: string;
	let isProduction: boolean;

	return {
		name: "tanstack-serwist",
		configResolved(config) {
			rootDir = config.root;
			isProduction = config.isProduction;
		},
		async buildStart() {
			if (!isProduction) {
				await buildServiceWorker(rootDir, false);
			}
		},
		async closeBundle() {
			if (isProduction) {
				await buildServiceWorker(rootDir, true);
			}
		},
	};
}

async function buildServiceWorker(rootDir: string, production: boolean) {
	const outName = "sw.js";
	const outDir = production
		? path.resolve(rootDir, ".output", "public")
		: path.resolve(rootDir, "public");
	const swSrc = path.resolve(rootDir, "src", "sw.ts");
	const swDest = path.resolve(outDir, outName);
	const env = production ? "production" : "dev";

	console.log(`\n[serwist] building service worker (${env})...`);

	try {
		await build({
			root: rootDir,
			configFile: false,
			define: {
				"process.env.NODE_ENV": JSON.stringify(
					production ? "production" : "development",
				),
			},
			build: {
				lib: {
					entry: swSrc,
					formats: ["es"],
					fileName: () => outName,
				},
				outDir,
				emptyOutDir: false,
				minify: production,
				rollupOptions: {
					output: {
						entryFileNames: outName,
					},
				},
			},
			logLevel: "error",
		});

		if (production) {
			const result = await injectManifest({
				swSrc: swDest,
				swDest,
				globDirectory: outDir,
				globPatterns: ["**/*.{js,css,html,png,svg,ico,webmanifest,woff,woff2}"],
				injectionPoint: "self.__SW_MANIFEST",
			});

			const cacheSize = (result.size / 1024 / 1024).toFixed(2);
			console.log(
				`[serwist] precached ${result.count} files (${cacheSize} MB)`,
			);
		} else {
			console.log("[serwist] dev service worker built");
		}
	} catch (error) {
		console.error("[serwist] failed to build service worker:", error);
		throw error;
	}
}
