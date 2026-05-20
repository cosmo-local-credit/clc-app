import { TanStackDevtools } from "@tanstack/react-devtools";
import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools";
import {
	createRootRouteWithContext,
	HeadContent,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { useEffect } from "react";
import { Toaster } from "sonner";
import { Web3Provider } from "#/providers/web3";
import appCss from "../styles.css?url";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
	{
		head: () => ({
			meta: [
				{ charSet: "utf-8" },
				{ name: "viewport", content: "width=device-width, initial-scale=1" },
				{ name: "theme-color", content: "#0a0a0a" },
				{ title: "CLC App" },
			],
			links: [
				{ rel: "stylesheet", href: appCss },
				{ rel: "manifest", href: "/manifest.json" },
				{ rel: "icon", href: "/favicon.ico" },
				{ rel: "apple-touch-icon", href: "/logo192.png" },
			],
		}),
		shellComponent: RootDocument,
		component: AppContent,
	},
);

function AppContent() {
	const { queryClient } = Route.useRouteContext();
	return (
		<Web3Provider queryClient={queryClient}>
			<Outlet />
		</Web3Provider>
	);
}

function RootDocument({ children }: { children: React.ReactNode }) {
	useEffect(() => {
		if (typeof window === "undefined") return;
		if (!("serviceWorker" in navigator)) return;

		let cancelled = false;
		void (async () => {
			const { Serwist } = await import("@serwist/window");
			if (cancelled) return;
			const serwist = new Serwist("/sw.js", { scope: "/", type: "module" });
			try {
				await serwist.register();
			} catch (err) {
				console.error("[sw] registration failed", err);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, []);

	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
				{children}
				<Toaster richColors closeButton />
				<TanStackDevtools
					config={{ position: "bottom-right" }}
					plugins={[
						{
							name: "Tanstack Router",
							render: <TanStackRouterDevtoolsPanel />,
						},
						{
							name: "Tanstack Query",
							render: <ReactQueryDevtoolsPanel />,
						},
					]}
				/>
				<Scripts />
			</body>
		</html>
	);
}
