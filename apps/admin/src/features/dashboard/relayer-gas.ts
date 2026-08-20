import type { AccountsClient } from "@clc/api/features/accounts/client";
import type { RelayerClient } from "@clc/api/features/relayer/client";
import { formatTokenAmount } from "@clc/core/features/wallet/logic";
import type { MetricTone } from "#/components/admin/metric-card";

/** Native CELO below this is treated as a low-gas warning on the dashboard. */
export const RELAYER_GAS_FLOOR_WEI = 10n * 10n ** 18n;

export type RelayerGas = {
  address: string;
  wei: string;
};

export function relayerGasTone(wei: bigint): MetricTone {
  return wei < RELAYER_GAS_FLOOR_WEI ? "danger" : "success";
}

export function formatRelayerGas(wei: string): string {
  return `${formatTokenAmount(wei, 18, 2)} CELO`;
}

/**
 * Relayer signer from `/health`, then native gas from the keystore account
 * status endpoint. That handler already reads the chain balance for any
 * address the backend holds a key for.
 */
export async function fetchRelayerGas(
  relayer: RelayerClient,
  accounts: Pick<AccountsClient, "getAccountStatus">,
  signal?: AbortSignal,
): Promise<RelayerGas> {
  const health = await relayer.getHealth();
  const address = health.result.relayerAddress;
  if (!address) {
    throw new Error("Relayer health did not include a signer address.");
  }

  const status = await accounts.getAccountStatus(address, signal);
  if (!/^\d+$/.test(status.gasBalance)) {
    throw new Error("Account status did not include a gas balance.");
  }

  return { address, wei: status.gasBalance };
}
