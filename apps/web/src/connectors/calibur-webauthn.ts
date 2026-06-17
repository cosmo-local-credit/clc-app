import type { CreateConnectorFn } from "wagmi";
import { createConnector } from "wagmi";
import { createRelayerClient } from "#/features/webauthn/api/relayer-client";
import { sendCaliburTransaction } from "#/features/webauthn/hooks/use-calibur-transaction";
import { RELAYER_URL } from "#/lib/backend-config";
import { clearWebAuthnCredential, getWebAuthnCredential } from "#/lib/webauthn-storage";

export function caliburWebAuthnConnector() {
  return createConnector(((config) => {
    const client = createRelayerClient(RELAYER_URL);

    return {
      id: "calibur-webauthn",
      name: "Passkey (WebAuthn)",
      type: "caliburWebAuthn" as const,

      async connect(parameters?: {
        chainId?: number | undefined;
        isReconnecting?: boolean | undefined;
      }): Promise<{ accounts: readonly `0x${string}`[]; chainId: number }> {
        void parameters;
        const cred = getWebAuthnCredential();
        if (!cred) throw new Error("No WebAuthn credential stored");
        if (cred.stale) throw new Error("Credential is stale; re-authenticate");
        const chainId = config.chains[0]?.id ?? 42220;
        return { accounts: [cred.address], chainId };
      },

      async disconnect() {
        clearWebAuthnCredential();
      },

      async getAccounts() {
        const cred = getWebAuthnCredential();
        if (!cred) return [] as const;
        return [cred.address] as const;
      },

      async getChainId() {
        return config.chains[0]?.id ?? 42220;
      },

      async getProvider() {
        return {
          on: (_event: string, _fn: (...args: unknown[]) => void) => {},
          removeListener: (_event: string, _fn: (...args: unknown[]) => void) => {},
          async request({
            method,
            params = [],
          }: {
            method: string;
            params?: readonly unknown[];
          }): Promise<unknown> {
            const cred = getWebAuthnCredential();
            const chain = config.chains[0];
            switch (method) {
              case "eth_accounts":
              case "eth_requestAccounts":
                return cred ? [cred.address] : [];

              case "eth_chainId":
                return `0x${(chain?.id ?? 42220).toString(16)}`;

              case "eth_sendTransaction": {
                const [tx] = params as [Record<string, string>];
                const { txHash } = await sendCaliburTransaction(
                  [
                    {
                      to: (tx.to ?? "0x") as `0x${string}`,
                      value: tx.value ?? "0",
                      data: (tx.data ?? "0x") as `0x${string}`,
                    },
                  ],
                  client,
                );
                return txHash;
              }

              case "personal_sign":
              case "eth_sign":
              case "eth_signTypedData_v4":
                throw new Error(
                  "Method not supported: WebAuthn connector does not sign arbitrary messages",
                );

              default:
                throw new Error(`Unsupported method: ${method}`);
            }
          },
        };
      },

      async isAuthorized() {
        const cred = getWebAuthnCredential();
        return cred !== null && !cred.stale;
      },

      async switchChain({ chainId }: { chainId: number }) {
        const chain = config.chains.find((c) => c.id === chainId);
        if (chain) {
          config.emitter.emit("change", { chainId: chain.id });
        }
        return chain ?? config.chains[0];
      },

      onAccountsChanged() {},
      onChainChanged() {},
      onDisconnect() {},
    };
  }) as CreateConnectorFn);
}
