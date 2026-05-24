import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { ConnectKitProvider, getDefaultConfig } from "connectkit";
import type { ReactNode } from "react";
import { createConfig, createStorage, http, WagmiProvider } from "wagmi";
import { celo } from "wagmi/chains";
import { caliburWebAuthnConnector } from "#/connectors/calibur-webauthn";
import { privateKeyConnector } from "#/connectors/privateKey";

const DEFAULT_WALLETCONNECT_PROJECT_ID = "4bc44b6179c99f9c147da08495a643d2";

const connectkitConfig = getDefaultConfig({
	chains: [celo],
	transports: {
		[celo.id]: http("https://forno.celo.org"),
	},
	enableAaveAccount: false,
	walletConnectProjectId:
		import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ??
		DEFAULT_WALLETCONNECT_PROJECT_ID,
	appName: "CLC App",
	appDescription: "Community exchange via vouchers and commitment pools",
	appUrl: "https://sarafu.network",
	appIcon: "/favicon.ico",
});

const storage =
	typeof window !== "undefined"
		? createStorage({ storage: window.localStorage })
		: undefined;

// Singleton connector instances. A single uid is required for wagmi to
// serialise/deserialise these connections in its localStorage store. Creating a
// new instance on every call produces a different uid, which causes wagmi to
// drop the connection entry during its next serialisation pass.
export const pkConnector = privateKeyConnector();
export const caliburConnector = caliburWebAuthnConnector();

export const wagmiConfig = createConfig({
	...connectkitConfig,
	storage,
	// Include custom connectors so wagmi can serialise their connections.
	connectors: [
		...(connectkitConfig.connectors ?? []),
		pkConnector,
		caliburConnector,
	],
});

export function Web3Provider({
	children,
	queryClient,
}: {
	children: ReactNode;
	queryClient: QueryClient;
}) {
	return (
		<WagmiProvider config={wagmiConfig} reconnectOnMount>
			<QueryClientProvider client={queryClient}>
				<ConnectKitProvider>{children}</ConnectKitProvider>
			</QueryClientProvider>
		</WagmiProvider>
	);
}
