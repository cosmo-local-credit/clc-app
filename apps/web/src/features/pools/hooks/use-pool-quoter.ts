import type { PoolVoucher, UserPool } from "@clc/api/features/pools/client";
import {
  poolParityPriceIndex,
  relativeQuoterPriceIndexAbi,
} from "@clc/core/features/pool-admin/logic";
import type { PoolQuoterType } from "@clc/core/features/pools/logic";
import { useQuery } from "@tanstack/react-query";
import { isAddress, zeroAddress } from "viem";
import { multicall, readContract } from "viem/actions";
import { useClient } from "wagmi";

/**
 * Which quoter a pool prices with, including the case where nobody knows.
 *
 * `unknown` is not a loading state — it is a pool whose quoter clc-core never
 * recorded and which does not answer the one selector that identifies a
 * RelativeQuoter. Signing a setter at that point would either revert or write a
 * price to a contract that reads it differently, so the management surface
 * refuses instead.
 */
export type PoolQuoterKind = PoolQuoterType | "unknown";

export const poolQuoterQueryKeys = {
  /** The root every quoter read hangs off, so one invalidation reaches them all. */
  all: ["pool-quoter"] as const,
  kind: (quoterAddress: string) => ["pool-quoter", "kind", quoterAddress.toLowerCase()] as const,
  rates: (
    quoterAddress: string,
    tokenAddresses: readonly string[],
    failureMode: "fallback" | "strict" = "fallback",
  ) => ["pool-quoter", "rates", quoterAddress.toLowerCase(), tokenAddresses, failureMode] as const,
};

/**
 * Imported pools and deploys that predate the column carry no `quoterType`, and
 * the three quoters report identical ERC-165 interfaces, so the type cannot be
 * read off the address. `priceIndex` can: it exists only on RelativeQuoter, and
 * a call that returns rather than reverts settles it. Nothing distinguishes an
 * OracleQuoter from a DecimalQuoter this way, which is why the probe answers
 * "relative" or nothing at all.
 */
export function usePoolQuoterKind(pool: UserPool | null | undefined) {
  const client = useClient();
  const quoterAddress =
    pool?.quoterAddress && isAddress(pool.quoterAddress) ? pool.quoterAddress : undefined;
  const recorded = pool?.quoterType ?? null;

  const probe = useQuery({
    queryKey: poolQuoterQueryKeys.kind(quoterAddress ?? "none"),
    queryFn: async (): Promise<PoolQuoterKind> => {
      if (!client || !quoterAddress) throw new Error("The quoter probe is missing a client.");
      await readContract(client, {
        address: quoterAddress,
        abi: relativeQuoterPriceIndexAbi,
        functionName: "priceIndex",
        args: [zeroAddress],
      });
      return "relative";
    },
    enabled: !!client && !!quoterAddress && recorded === null,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });

  if (recorded) return { kind: recorded as PoolQuoterKind, isPending: false };
  if (!quoterAddress) return { kind: "unknown" as const, isPending: false };
  return { kind: probe.data ?? ("unknown" as const), isPending: probe.isPending };
}

/**
 * Every pool voucher's rate, keyed by lowercased token address.
 *
 * One multicall rather than a read per row. An unpriced token reads back as
 * `0`, which the quoter itself treats as parity. Catalog lists tolerate an
 * individual reverted read as parity; configuration opts into strict failures
 * so it never writes a fallback over an unread current rate.
 */
export function usePoolVoucherRates(
  pool: UserPool | null | undefined,
  vouchers: PoolVoucher[],
  enabled: boolean,
  options: { failOnReadError?: boolean } = {},
) {
  return usePoolVoucherRatesByAddress(
    pool,
    vouchers.map((voucher) => voucher.tokenAddress),
    enabled,
    options,
  );
}

/**
 * Relative-quoter rates for arbitrary voucher addresses.
 *
 * The catalog wrapper above remains the normal list consumer. Approval needs
 * the address form because a voucher can have retained on-chain configuration
 * and pool deposits before the catalog projects it as a member.
 */
export function usePoolVoucherRatesByAddress(
  pool: UserPool | null | undefined,
  addresses: readonly string[],
  enabled: boolean,
  options: { failOnReadError?: boolean } = {},
) {
  const client = useClient();
  const quoterAddress =
    pool?.quoterAddress && isAddress(pool.quoterAddress) ? pool.quoterAddress : undefined;
  const tokenAddresses = [
    ...new Set(
      addresses.filter((address) => isAddress(address)).map((address) => address.toLowerCase()),
    ),
  ].sort();
  const failureMode = options.failOnReadError ? "strict" : "fallback";

  return useQuery({
    queryKey: poolQuoterQueryKeys.rates(quoterAddress ?? "none", tokenAddresses, failureMode),
    queryFn: async () => {
      if (!client || !quoterAddress) throw new Error("The rate read is missing a client.");
      const results = await multicall(client, {
        allowFailure: true,
        contracts: tokenAddresses.map((address) => ({
          address: quoterAddress,
          abi: relativeQuoterPriceIndexAbi,
          functionName: "priceIndex" as const,
          args: [address as `0x${string}`],
        })),
      });
      const parity = BigInt(poolParityPriceIndex());
      return new Map(
        tokenAddresses.map((address, index) => {
          const result = results[index];
          if (result?.status !== "success" && options.failOnReadError) {
            throw new Error(`The rate read failed for ${address}.`);
          }
          const value = result?.status === "success" ? result.result : 0n;
          return [address, value > 0n ? value : parity];
        }),
      );
    },
    enabled: enabled && !!client && !!quoterAddress && tokenAddresses.length > 0,
    retry: false,
    staleTime: 30_000,
  });
}
