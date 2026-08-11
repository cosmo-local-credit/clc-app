import { useQuery } from "@tanstack/react-query";
import { useConnection } from "wagmi";

import { BackendApiError } from "@clc/api/client/errors";
import { type SessionResult } from "@clc/api/features/auth/client";
import { useReconnectAttempted } from "#/providers/auth-bootstrap";
import { clcApi } from "#/lib/api";

type AuthStatusState =
  | "loading"
  | "guest"
  | "connectedNoSession"
  | "authenticated"
  | "sessionCheckError";

export type AuthStatus = {
  state: AuthStatusState;
  isLoading: boolean;
  isAuthenticated: boolean;
  needsBackendSignin: boolean;
  address: `0x${string}` | undefined;
  chainId: number | undefined;
  connectorId: string | undefined;
  session: SessionResult | null | undefined;
  error: Error | null;
  retry: () => void;
};

export const authSessionQueryKey = ["auth", "session"] as const;

function authSessionQueryKeyForAddress(address: `0x${string}` | undefined) {
  return [...authSessionQueryKey, address?.toLowerCase() ?? "none"] as const;
}

export function useAuthStatus(): AuthStatus {
  const reconnectAttempted = useReconnectAttempted();
  const { address, chainId, connector, status } = useConnection();
  const sessionQuery = useQuery({
    queryKey: authSessionQueryKeyForAddress(address),
    queryFn: () => clcApi.auth.getSession(),
    enabled: reconnectAttempted && !!address,
    retry: false,
  });

  const connectorId = connector?.id;
  const session = sessionQuery.data;
  const error = sessionQuery.error instanceof Error ? sessionQuery.error : null;

  let state: AuthStatusState;
  if (!reconnectAttempted || status === "connecting" || status === "reconnecting") {
    state = "loading";
  } else if (!address) {
    state = "guest";
  } else if (sessionQuery.isPending) {
    state = "loading";
  } else if (sessionQuery.isError) {
    if (error instanceof BackendApiError && (error.status === 401 || error.code === "E06")) {
      state = "connectedNoSession";
    } else {
      state = "sessionCheckError";
    }
  } else if (!session) {
    state = "connectedNoSession";
  } else if (session.address.toLowerCase() !== address.toLowerCase()) {
    state = "connectedNoSession";
  } else {
    state = "authenticated";
  }

  return {
    state,
    isLoading: state === "loading",
    isAuthenticated: state === "authenticated",
    needsBackendSignin: state === "connectedNoSession",
    address,
    chainId,
    connectorId,
    session,
    error,
    retry: () => {
      void sessionQuery.refetch();
    },
  };
}
