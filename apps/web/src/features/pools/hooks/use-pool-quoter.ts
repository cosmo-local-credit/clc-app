import type { OracleFeed } from "@clc/api/features/oracle-feeds/client";
import { oracleFeedsQueryOptions } from "@clc/api/features/oracle-feeds/queries";
import type { PoolVoucher, UserPool } from "@clc/api/features/pools/client";
import {
  chainlinkAggregatorAbi,
  isOracleFeedStale,
  oracleFeedPrice,
  oracleQuoterBaseCurrencyAbi,
  oracleQuoterPolicyAbi,
  poolParityPriceIndex,
  relativeQuoterPriceIndexAbi,
} from "@clc/core/features/pool-admin/logic";
import type { PoolQuoterType } from "@clc/core/features/pools/logic";
import { useQuery } from "@tanstack/react-query";
import { type ContractFunctionParameters, getAddress, isAddress, zeroAddress } from "viem";
import { multicall, readContract } from "viem/actions";
import { useClient } from "wagmi";

import { oracleFeedsClient } from "#/lib/api/oracle-feeds";
import { CHAIN_ID } from "#/lib/chain";

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
  oracles: (quoterAddress: string, tokenAddresses: readonly string[]) =>
    ["pool-quoter", "oracles", quoterAddress.toLowerCase(), tokenAddresses] as const,
  feedRounds: (feeds: readonly { address: string; maxStalenessSeconds: number | null }[]) =>
    ["pool-quoter", "feed-rounds", feeds] as const,
};

/**
 * Imported pools and deploys that predate the column carry no `quoterType`, and
 * the three quoters report identical ERC-165 interfaces, so the type cannot be
 * read off the address. Two selectors can: `priceIndex` exists only on
 * RelativeQuoter and `baseCurrency` only on OracleQuoter, so a call that
 * returns rather than reverts settles it. DecimalQuoter answers neither, and
 * stays unknown.
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
      try {
        await readContract(client, {
          address: quoterAddress,
          abi: relativeQuoterPriceIndexAbi,
          functionName: "priceIndex",
          args: [zeroAddress],
        });
        return "relative";
      } catch {
        await readContract(client, {
          address: quoterAddress,
          abi: oracleQuoterBaseCurrencyAbi,
          functionName: "baseCurrency",
        });
        return "oracle";
      }
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
 * Relative-quoter rates for arbitrary voucher addresses.
 *
 * The address form supports vouchers with retained on-chain configuration and
 * Pool deposits before the catalog projects them as members.
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

/** A voucher's on-chain OracleQuoter mapping: its aggregator, if any, and per-feed bound. */
export type PoolVoucherOracle = {
  aggregatorAddress: `0x${string}` | null;
  /** Zero is the quoter's "use the global bound". */
  maxStalenessSeconds: bigint;
  /** The quoter's global `maxStaleness()`, which a zero per-token bound defers to. */
  globalMaxStalenessSeconds: bigint;
};

/**
 * `oracles(token)` and `oracleMaxStaleness(token)` for each voucher, keyed by
 * lowercased token address.
 *
 * The chain, not the catalog: the indexer can lag a steward who has just set a
 * feed, and the editor compares against this value to decide whether a quoter
 * call is needed at all. Strict, so an unread mapping is never mistaken for
 * "no feed" and overwritten.
 */
export function usePoolVoucherOracles(
  pool: UserPool | null | undefined,
  addresses: readonly string[],
  enabled: boolean,
) {
  const client = useClient();
  const quoterAddress =
    pool?.quoterAddress && isAddress(pool.quoterAddress) ? pool.quoterAddress : undefined;
  const tokenAddresses = [
    ...new Set(
      addresses.filter((address) => isAddress(address)).map((address) => address.toLowerCase()),
    ),
  ].sort();

  return useQuery({
    queryKey: poolQuoterQueryKeys.oracles(quoterAddress ?? "none", tokenAddresses),
    queryFn: async () => {
      if (!client || !quoterAddress) throw new Error("The feed read is missing a client.");
      // The global bound first, then each token's mapping and own bound. Typed
      // as one ABI's calls: the mixed list would otherwise narrow to the first.
      const contracts: ContractFunctionParameters<typeof oracleQuoterPolicyAbi>[] = [
        { address: quoterAddress, abi: oracleQuoterPolicyAbi, functionName: "maxStaleness" },
        ...tokenAddresses.flatMap((address) => [
          {
            address: quoterAddress,
            abi: oracleQuoterPolicyAbi,
            functionName: "oracles" as const,
            args: [address as `0x${string}`] as const,
          },
          {
            address: quoterAddress,
            abi: oracleQuoterPolicyAbi,
            functionName: "oracleMaxStaleness" as const,
            args: [address as `0x${string}`] as const,
          },
        ]),
      ];
      const results = await multicall(client, { allowFailure: true, contracts });
      const [global, ...perToken] = results;
      if (global?.status !== "success")
        throw new Error("The quoter's freshness bound read failed.");
      return new Map(
        tokenAddresses.map((address, index): [string, PoolVoucherOracle] => {
          const oracle = perToken[index * 2];
          const staleness = perToken[index * 2 + 1];
          if (oracle?.status !== "success" || staleness?.status !== "success") {
            throw new Error(`The feed read failed for ${address}.`);
          }
          const aggregator = oracle.result;
          if (typeof aggregator !== "string")
            throw new Error(`The feed read failed for ${address}.`);
          return [
            address,
            {
              aggregatorAddress: aggregator === zeroAddress ? null : getAddress(aggregator),
              maxStalenessSeconds: staleness.result as bigint,
              globalMaxStalenessSeconds: global.result as bigint,
            },
          ];
        }),
      );
    },
    enabled: enabled && !!client && !!quoterAddress && tokenAddresses.length > 0,
    retry: false,
    staleTime: 30_000,
  });
}

/** clc-core's verified feeds for the app's chain. */
export function useOracleFeeds(enabled: boolean) {
  return useQuery({ ...oracleFeedsQueryOptions(oracleFeedsClient, CHAIN_ID), enabled });
}

export type OracleFeedRound =
  | { status: "ready"; price: string; stale: boolean }
  | { status: "unreadable" };

/**
 * Each feed's latest round, keyed by EIP-55 address.
 *
 * Per feed rather than all or nothing: a feed that reverts or answers zero is
 * shown as unreadable beside the ones that answered. `decimals()` is read from
 * the feed itself, since a custom address carries no registry metadata.
 * Staleness applies the bound the quoter would: the feed's own, or the default.
 */
export function useOracleFeedRounds(
  feeds: readonly Pick<OracleFeed, "address" | "maxStalenessSeconds">[],
  enabled: boolean,
) {
  const client = useClient();
  const unique = [
    ...new Map(
      feeds
        .filter((feed) => isAddress(feed.address))
        .map((feed) => [getAddress(feed.address), feed.maxStalenessSeconds] as const),
    ),
  ]
    .map(([address, maxStalenessSeconds]) => ({ address, maxStalenessSeconds }))
    .sort((a, b) => a.address.localeCompare(b.address));

  return useQuery({
    queryKey: poolQuoterQueryKeys.feedRounds(unique),
    queryFn: async () => {
      if (!client) throw new Error("The feed read is missing a client.");
      const results = await multicall(client, {
        allowFailure: true,
        contracts: unique.flatMap((feed) => [
          {
            address: feed.address,
            abi: chainlinkAggregatorAbi,
            functionName: "latestRoundData" as const,
          },
          { address: feed.address, abi: chainlinkAggregatorAbi, functionName: "decimals" as const },
        ]),
      });
      const nowSeconds = Date.now() / 1000;
      return new Map(
        unique.map((feed, index): [`0x${string}`, OracleFeedRound] => {
          const round = results[index * 2];
          const decimals = results[index * 2 + 1];
          if (round?.status !== "success" || decimals?.status !== "success") {
            return [feed.address, { status: "unreadable" }];
          }
          const [, answer, , updatedAt] = round.result as readonly [
            bigint,
            bigint,
            bigint,
            bigint,
            bigint,
          ];
          const price = oracleFeedPrice(answer, Number(decimals.result));
          if (price === null) return [feed.address, { status: "unreadable" }];
          return [
            feed.address,
            {
              status: "ready",
              price,
              stale: isOracleFeedStale({
                updatedAt,
                nowSeconds,
                maxStalenessSeconds: feed.maxStalenessSeconds,
              }),
            },
          ];
        }),
      );
    },
    enabled: enabled && !!client && unique.length > 0,
    retry: false,
    staleTime: 60_000,
  });
}

/**
 * What a list row says about a voucher's feed on an oracle pool: the pair it
 * prices from, an aggregator the registry does not list, or none at all.
 */
export type PoolVoucherFeedStatus =
  | { kind: "none" }
  | { kind: "verified"; label: string }
  | { kind: "unverified"; address: `0x${string}` };

/**
 * Each catalog voucher's feed status keyed by lowercased token address, or
 * null on a pool that is not oracle-priced. The catalog names the aggregator;
 * the registry, where it answers, supplies the pair (`EUR / USD`) in place of
 * its bare name.
 */
export function usePoolVoucherFeedStatuses(
  pool: UserPool | null | undefined,
  vouchers: readonly PoolVoucher[],
): Map<string, PoolVoucherFeedStatus> | null {
  const oracle = usePoolQuoterKind(pool).kind === "oracle";
  const feeds = useOracleFeeds(oracle);
  if (!oracle) return null;
  return new Map(
    vouchers.map((voucher): [string, PoolVoucherFeedStatus] => {
      const address = voucher.tokenAddress.toLowerCase();
      if (!voucher.oracleAddress) return [address, { kind: "none" }];
      if (voucher.oracleFeedId === null) {
        return [address, { kind: "unverified", address: voucher.oracleAddress }];
      }
      const registered = feeds.data?.find((feed) => feed.address === voucher.oracleAddress);
      return [
        address,
        {
          kind: "verified",
          label: registered?.description ?? voucher.oracleName ?? voucher.oracleAddress,
        },
      ];
    }),
  );
}
