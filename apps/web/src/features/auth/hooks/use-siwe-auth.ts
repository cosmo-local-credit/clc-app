import { useCallback } from "react";
import { useAccount } from "wagmi";

import { useBackendWalletSignin } from "./use-backend-auth";

export type SiweAuthState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "done" }
  | { status: "error"; error: string };

/**
 * Performs the backend SIWE sign-in flow for the currently connected wallet.
 * The backend sets the HttpOnly session cookie; no client-side token is needed.
 */
export function useSiweAuth() {
  const { address, chainId } = useAccount();
  const signin = useBackendWalletSignin(address, chainId);

  const authenticate = useCallback(async () => {
    await signin.mutateAsync();
  }, [signin]);

  const state: SiweAuthState = signin.isPending
    ? { status: "pending" }
    : signin.isSuccess
      ? { status: "done" }
      : signin.isError
        ? {
            status: "error",
            error: signin.error instanceof Error ? signin.error.message : "Authentication failed",
          }
        : { status: "idle" };

  return { state, authenticate };
}
