import { useCallback, useState } from "react";
import { SiweMessage } from "siwe";
import { useAccount } from "wagmi";
import { signMessage } from "wagmi/actions";

import { wagmiConfig } from "#/providers/web3-config";
import { getSiweNonce, verifySiweSignature } from "../api/client";
import { getAuthToken, setAuthToken } from "../state/token";

export type SiweAuthState =
	| { status: "idle" }
	| { status: "pending" }
	| { status: "done"; token: string }
	| { status: "error"; error: string };

/**
 * Performs the SIWE challenge-response flow to obtain a short-lived JWT from
 * the Application API. The token is stored in sessionStorage and returned.
 *
 * Call `authenticate()` once the wallet is connected. Re-calling when already
 * authenticated returns the cached token immediately.
 *
 * Uses `signMessage` from wagmi/actions (not the hook) to bypass the React
 * state propagation window that causes ConnectorNotConnectedError when called
 * immediately after `connect()` resolves.
 */
export function useSiweAuth() {
	const { address, chainId } = useAccount();
	const [state, setState] = useState<SiweAuthState>({ status: "idle" });

	const authenticate = useCallback(async (): Promise<string> => {
		const cached = getAuthToken();
		if (cached) {
			setState({ status: "done", token: cached });
			return cached;
		}

		if (!address) throw new Error("Wallet not connected");

		setState({ status: "pending" });
		try {
			const nonce = await getSiweNonce();

			const siweMsg = new SiweMessage({
				domain: window.location.host,
				address,
				statement: "Sign in to CLC App",
				uri: window.location.origin,
				version: "1",
				chainId: chainId ?? 42220,
				nonce,
			});
			const message = siweMsg.prepareMessage();
			// Use wagmi/actions signMessage to access the config store directly.
			// This avoids ConnectorNotConnectedError when called immediately after
			// connect() resolves — the React hook state lags one render behind.
			const signature = await signMessage(wagmiConfig, { message });

			const { token } = await verifySiweSignature(message, signature);
			setAuthToken(token);
			setState({ status: "done", token });
			return token;
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Authentication failed";
			setState({ status: "error", error: msg });
			throw err;
		}
	}, [address, chainId]);

	return { state, authenticate };
}
