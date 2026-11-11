import type { UserPool } from "@clc/api/features/pools/client";
import {
  feePolicyDefaultFeeAbi,
  POOL_FEE_ADDRESS_SEAL_STATE,
  POOL_FEE_PERCENT_DECIMALS,
  swapPoolFeeAddressAbi,
  swapPoolIsSealedAbi,
} from "@clc/core/features/pool-admin/logic";
import { formatTokenAmount } from "@clc/core/features/wallet/logic";
import { useQuery } from "@tanstack/react-query";
import { isAddress, zeroAddress } from "viem";
import { multicall } from "viem/actions";
import { useClient } from "wagmi";

export type PoolFeeSettings = {
  /** The pool's default swap fee in PPM, as the FeePolicy stores it. */
  feePpm: string;
  /** The same fee as a percentage string, which is what a steward types. */
  feePercent: string;
  /** Null where the pool has no recipient, in which case `withdraw` reverts. */
  feeAddress: `0x${string}` | null;
  /**
   * Whether `setFeeAddress` reverts `Sealed`, which pins fee collection to the
   * current recipient. Null when the read failed: unknown, so the steward may
   * try and the relay reports a refusal.
   */
  feeAddressSealed: boolean | null;
};

export const poolFeeSettingsQueryKeys = {
  all: ["pool-fee-settings"] as const,
  pool: (poolAddress: string, feePolicyAddress: string) =>
    ["pool-fee-settings", poolAddress.toLowerCase(), feePolicyAddress.toLowerCase()] as const,
};

/**
 * What the pool charges for a swap and where it pays it, read from the chain.
 *
 * Not from the catalog: clc-core writes neither `fee_address` nor `fee_ppm` when
 * it promotes a confirmed deploy, so both columns are NULL for every pool and
 * the screen reported a configured recipient as "Not set". They are also the
 * two values a steward changes after the deploy, through contracts the indexer
 * does not project — so even a populated catalog would go stale the moment one
 * was edited.
 */
export function usePoolFeeSettings(pool: UserPool | null | undefined, enabled: boolean) {
  const client = useClient();
  const poolAddress = pool?.address && isAddress(pool.address) ? pool.address : undefined;
  const feePolicyAddress =
    pool?.feePolicyAddress && isAddress(pool.feePolicyAddress) ? pool.feePolicyAddress : undefined;

  return useQuery({
    queryKey: poolFeeSettingsQueryKeys.pool(poolAddress ?? "none", feePolicyAddress ?? "none"),
    queryFn: async (): Promise<PoolFeeSettings> => {
      if (!client || !poolAddress || !feePolicyAddress) {
        throw new Error("The pool fee read is missing a client or a fee policy.");
      }
      const [feeAddressRead, feePpmRead, sealedRead] = await multicall(client, {
        allowFailure: true,
        contracts: [
          { address: poolAddress, abi: swapPoolFeeAddressAbi, functionName: "feeAddress" as const },
          {
            address: feePolicyAddress,
            abi: feePolicyDefaultFeeAbi,
            functionName: "getDefaultFee" as const,
          },
          {
            address: poolAddress,
            abi: swapPoolIsSealedAbi,
            functionName: "isSealed" as const,
            args: [POOL_FEE_ADDRESS_SEAL_STATE],
          },
        ],
      });
      // The seal is advisory; the rate and the recipient are what the form shows.
      if (feeAddressRead.status !== "success") throw feeAddressRead.error;
      if (feePpmRead.status !== "success") throw feePpmRead.error;
      const feeAddress = feeAddressRead.result;
      const feePpm = feePpmRead.result;

      return {
        feePpm: feePpm.toString(),
        feePercent: formatTokenAmount(
          feePpm.toString(),
          POOL_FEE_PERCENT_DECIMALS,
          POOL_FEE_PERCENT_DECIMALS,
        ),
        feeAddress: feeAddress.toLowerCase() === zeroAddress ? null : feeAddress,
        feeAddressSealed: sealedRead.status === "success" ? sealedRead.result : null,
      };
    },
    enabled: enabled && !!client && !!poolAddress && !!feePolicyAddress,
    retry: false,
    staleTime: 15_000,
  });
}
