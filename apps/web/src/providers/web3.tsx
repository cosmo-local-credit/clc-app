import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { ConnectKitProvider, getDefaultConfig } from "connectkit";
import { type ReactNode, useEffect } from "react";
import { createConfig, createStorage, http, WagmiProvider } from "wagmi";
import { connect, getAccount } from "wagmi/actions";
import { celo } from "wagmi/chains";
import {
	hasStoredPrivateKey,
	privateKeyConnector,
} from "#/connectors/privateKey";

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

export const wagmiConfig = createConfig({
	...connectkitConfig,
	storage,
	connectors: connectkitConfig.connectors ?? [],
});

function PrivateKeyReconnect() {
	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}

		if (!hasStoredPrivateKey()) {
			return;
		}

		if (getAccount(wagmiConfig).isConnected) {
			return;
		}

		void connect(wagmiConfig, {
			connector: privateKeyConnector(),
		}).catch(() => {});
	}, []);

	return null;
}

export function Web3Provider({
	children,
	queryClient,
}: {
	children: ReactNode;
	queryClient: QueryClient;
}) {
	return (
		<WagmiProvider config={wagmiConfig}>
			<QueryClientProvider client={queryClient}>
				<ConnectKitProvider>{children}</ConnectKitProvider>
				<PrivateKeyReconnect />
			</QueryClientProvider>
		</WagmiProvider>
	);
}
