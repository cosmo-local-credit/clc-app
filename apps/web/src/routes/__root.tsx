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
import { useEffect, useMemo, useState } from "react";
import { Toaster } from "sonner";
import { privateKeyToAccount } from "viem/accounts";
import { connect } from "wagmi/actions";
import { Button } from "#/components/ui/button";
import {
	DialogBackdrop,
	DialogContent,
	DialogPortal,
	DialogRoot,
	DialogTitle,
} from "#/components/ui/dialog";
import {
	clearPrivateKey,
	getStoredKey,
	storePrivateKey,
} from "#/connectors/privateKey";
import { useScanUrlImport } from "#/lib/scan-url-import";
import {
	clearWebAuthnCredential,
	getWebAuthnCredential,
	storeWebAuthnCredential,
} from "#/lib/webauthn-storage";
import { Web3Provider } from "#/providers/web3";
import { pkConnector, wagmiConfig } from "#/providers/web3-config";
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
				{ rel: "icon", type: "image/svg+xml", href: "/logo.svg" },
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
			<AppInner />
		</Web3Provider>
	);
}

function AppInner() {
	const { pendingKey, clearPendingKey } = useScanUrlImport();
	const [switching, setSwitching] = useState(false);

	const pendingAddress = useMemo(
		() => (pendingKey ? privateKeyToAccount(pendingKey).address : null),
		[pendingKey],
	);

	async function handleConfirmSwitch() {
		if (!pendingKey) return;
		setSwitching(true);
		const previousPrivateKey = getStoredKey();
		const previousWebAuthnCredential = getWebAuthnCredential();
		try {
			storePrivateKey(pendingKey);
			await connect(wagmiConfig, { connector: pkConnector });
			clearWebAuthnCredential();
			clearPendingKey();
		} catch {
			if (previousPrivateKey) {
				storePrivateKey(previousPrivateKey);
			} else {
				clearPrivateKey();
			}

			if (previousWebAuthnCredential) {
				storeWebAuthnCredential({
					credentialId: previousWebAuthnCredential.credentialId,
					keyHash: previousWebAuthnCredential.keyHash,
					publicKeyX: previousWebAuthnCredential.publicKeyX,
					publicKeyY: previousWebAuthnCredential.publicKeyY,
					address: previousWebAuthnCredential.address,
				});
			} else {
				clearWebAuthnCredential();
			}
		} finally {
			setSwitching(false);
		}
	}

	return (
		<>
			<Outlet />
			{pendingKey && pendingAddress ? (
				<DialogRoot
					open={true}
					onOpenChange={(isOpen) => {
						if (!isOpen) clearPendingKey();
					}}
				>
					<DialogPortal>
						<DialogBackdrop />
						<DialogContent>
							<DialogTitle className="text-base font-semibold">
								Switch wallet?
							</DialogTitle>
							<p className="mt-1 text-sm text-muted-foreground">
								A paper wallet QR was scanned. Import this address?
							</p>
							<p className="mt-2 truncate font-mono text-xs text-foreground">
								{pendingAddress}
							</p>
							<div className="mt-5 flex flex-col gap-2">
								<Button
									className="h-11 w-full"
									disabled={switching}
									onClick={handleConfirmSwitch}
								>
									{switching ? "Switching…" : "Switch wallet"}
								</Button>
								<Button
									variant="ghost"
									className="h-11 w-full"
									onClick={clearPendingKey}
									disabled={switching}
								>
									Cancel
								</Button>
							</div>
						</DialogContent>
					</DialogPortal>
				</DialogRoot>
			) : null}
		</>
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
