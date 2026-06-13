import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useEffect } from "react";
import { useReconnect, WagmiProvider } from "wagmi";
import { wagmiConfig } from "#/providers/web3-config";

export function Web3Provider({
  children,
  queryClient,
}: {
  children: ReactNode;
  queryClient: QueryClient;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig} reconnectOnMount={false}>
        <ReconnectOnMount />
        {children}
      </WagmiProvider>
    </QueryClientProvider>
  );
}

// Defers the wagmi reconnect to after mount so it does not fire synchronously
// during the SSR hydration render pass, which would cause React 19 to throw
// "Cannot update a component while rendering a different component".
function ReconnectOnMount() {
  const { mutate: reconnect } = useReconnect();
  useEffect(() => {
    reconnect();
  }, [reconnect]);
  return null;
}
