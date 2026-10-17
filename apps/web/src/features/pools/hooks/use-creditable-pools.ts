import { isAccountNearbyScope } from "@clc/core/features/catalog/nearby";
import {
  type NearbyCatalogFilter,
  useNearbyCatalog,
  useNearbyCatalogFilter,
  nearbyQueryKey,
  nearbyQueryPolicy,
} from "#/components/nearby-catalog";
import { isRetryableBackendError } from "@clc/api/client/errors";
import type { UserPool } from "@clc/api/features/pools/client";
import {
  type HexAddress,
  type VoucherRef,
  serializeVoucherRef,
} from "@clc/core/features/catalog/logic";
import { tokenIndexHaveAbi, limiterLimitOfAbi } from "@clc/core/features/pool-admin/logic";
import { erc20BalanceOfAbi } from "@clc/core/features/pool-swaps/logic";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { isAddress } from "viem";
import { getBlockNumber, multicall } from "viem/actions";
import { useClient } from "wagmi";

import { useAllAccountTokens } from "#/features/wallet/hooks/use-account-balances";
import { CHAIN_ID } from "#/lib/chain";
import {
  fetchFilteredPoolCatalog,
  usePoolFacetVocabulary,
} from "#/features/pools/hooks/use-filtered-pools";
import {
  chunkPoolCreditVouchers,
  mergePoolCreditCandidates,
  type PoolCreditCandidate,
  poolCreditInputCapacity,
} from "#/features/pools/logic/creditable-pools";

const CANDIDATE_REQUEST_CONCURRENCY = 3;
const CANDIDATE_STALE_TIME_MS = 10 * 60_000;
const CAPACITY_STALE_TIME_MS = 15_000;
const CREDIT_READS_PER_PAIR = 4;

const poolCreditQueryKeys = {
  candidates: (vouchers: readonly VoucherRef[]) =>
    ["clc", "pools", "credit-candidates", vouchers.map(serializeVoucherRef)] as const,
  capacity: (
    holderAddress: string,
    candidates: readonly PoolCreditCandidate[],
    holdingsVersion: readonly string[],
  ) =>
    [
      "pool-swap-tokens",
      "creditable-pools",
      holderAddress.toLowerCase(),
      candidates.map((candidate) => [
        candidate.pool.address.toLowerCase(),
        candidate.pool.tokenRegistryAddress?.toLowerCase() ?? null,
        candidate.pool.limiterAddress?.toLowerCase() ?? null,
        candidate.tokenAddresses.map((address) => address.toLowerCase()),
      ]),
      holdingsVersion,
    ] as const,
};

export type CreditablePoolsResult = {
  pools: UserPool[];
  status: "loading" | "ready" | "error";
  isRefreshing: boolean;
  hasVerificationGaps: boolean;
  retry: () => void;
  /** Any of the reads is running, including again after `retry`. */
  retrying: boolean;
};

type PoolCreditCapacityResult = {
  pools: UserPool[];
  hasVerificationGaps: boolean;
  blockNumber: bigint;
};

type MulticallEntry = { status: "success"; result: unknown } | { status: "failure" } | undefined;

/**
 * Every catalog pool that can currently accept at least one voucher the holder
 * owns, independent of the Pools screen's optional search and facet filters.
 */
export function useCreditablePools(holderAddress: string | undefined): CreditablePoolsResult {
  const nearby = useNearbyCatalog();
  const visibilityFilter = useNearbyCatalogFilter();
  const client = useClient();
  const holder = holderAddress && isAddress(holderAddress) ? holderAddress : undefined;
  const holdings = useAllAccountTokens(holder);
  const vocabulary = usePoolFacetVocabulary(Boolean(holder));

  const heldVoucherRefs = useMemo(() => {
    if (holdings.isPending || vocabulary.data === undefined) return [];
    const related = new Set(
      vocabulary.data.voucherFacets.map((voucher) => serializeVoucherRef(voucher)),
    );
    const refs = new Map<string, VoucherRef>();
    for (const token of holdings.tokens) {
      if (!isAddress(token.tokenAddress)) continue;
      const ref: VoucherRef = {
        chainId: CHAIN_ID,
        address: token.tokenAddress.toLowerCase() as HexAddress,
      };
      const key = serializeVoucherRef(ref);
      if (related.has(key)) refs.set(key, ref);
    }
    return [...refs.values()].sort((left, right) =>
      serializeVoucherRef(left).localeCompare(serializeVoucherRef(right)),
    );
  }, [holdings.isPending, holdings.tokens, vocabulary.data]);

  const sourceReady = Boolean(holder) && !holdings.isPending && vocabulary.data !== undefined;
  const candidates = useQuery({
    queryKey: nearbyQueryKey(poolCreditQueryKeys.candidates(heldVoucherRefs), nearby),
    queryFn: ({ signal }) =>
      fetchPoolCreditCandidates(
        heldVoucherRefs,
        signal,
        isAccountNearbyScope(nearby),
        visibilityFilter,
      ),
    enabled: sourceReady,
    staleTime: CANDIDATE_STALE_TIME_MS,
    ...nearbyQueryPolicy(nearby),
    retry: (failureCount, error) => failureCount < 1 && isRetryableBackendError(error),
  });

  const holdingsVersion = useMemo(
    () =>
      holdings.tokens.map((token) => `${token.tokenAddress.toLowerCase()}:${token.balance}`).sort(),
    [holdings.tokens],
  );
  const candidatePools = candidates.data ?? [];
  const capacity = useQuery({
    queryKey: nearbyQueryKey(
      poolCreditQueryKeys.capacity(holder ?? "none", candidatePools, holdingsVersion),
      nearby,
    ),
    queryFn: () => {
      if (!client || !holder) {
        throw new Error("The creditable pool read is missing a chain client or holder.");
      }
      return readPoolCreditCapacity(client, holder, candidatePools);
    },
    enabled: Boolean(client && holder && candidates.data && candidatePools.length > 0),
    retry: false,
    staleTime: CAPACITY_STALE_TIME_MS,
    refetchOnMount: "always",
  });

  const initialError =
    (!holder || !client) && Boolean(holder)
      ? true
      : (holdings.isError && holdings.isPending) ||
        (vocabulary.isError && vocabulary.data === undefined) ||
        (candidates.isError && candidates.data === undefined) ||
        (candidatePools.length > 0 && capacity.isError && capacity.data === undefined);
  const loading =
    !initialError &&
    (!holder ||
      !client ||
      holdings.isPending ||
      vocabulary.data === undefined ||
      candidates.data === undefined ||
      (candidatePools.length > 0 && capacity.data === undefined));
  const pools = candidatePools.length === 0 ? [] : (capacity.data?.pools ?? []);
  const backgroundError =
    holdings.isError || vocabulary.isError || candidates.isError || capacity.isError;
  const status: CreditablePoolsResult["status"] = initialError
    ? "error"
    : loading
      ? "loading"
      : "ready";
  const fetching =
    holdings.isFetching || vocabulary.isFetching || candidates.isFetching || capacity.isFetching;

  return {
    pools,
    status,
    isRefreshing: status === "ready" && fetching,
    hasVerificationGaps:
      (capacity.data?.hasVerificationGaps ?? false) || (status === "ready" && backgroundError),
    retry: () => {
      void holdings.refetch();
      void vocabulary.refetch();
      void candidates.refetch();
      if (candidatePools.length > 0) void capacity.refetch();
    },
    retrying: fetching,
  };
}

async function fetchPoolCreditCandidates(
  vouchers: readonly VoucherRef[],
  signal: AbortSignal,
  nearby = false,
  visibilityFilter?: NearbyCatalogFilter,
): Promise<PoolCreditCandidate[]> {
  const chunks = chunkPoolCreditVouchers(vouchers);
  if (chunks.length === 0) return [];

  const results = await mapWithConcurrency(chunks, CANDIDATE_REQUEST_CONCURRENCY, async (chunk) => {
    const catalog = await fetchFilteredPoolCatalog({
      filter: {
        term: "",
        tags: [],
        tagMatch: "any",
        vouchers: chunk,
        voucherMatch: "any",
      },
      signal,
      nearby,
      visibilityFilter,
    });
    return {
      pools: catalog.pools,
      tokenAddresses: chunk.map((voucher) => voucher.address),
    };
  });

  return mergePoolCreditCandidates(results);
}

async function readPoolCreditCapacity(
  client: Parameters<typeof getBlockNumber>[0],
  holderAddress: HexAddress,
  candidates: readonly PoolCreditCandidate[],
): Promise<PoolCreditCapacityResult> {
  const pairs = candidates.flatMap((candidate) =>
    candidate.tokenAddresses.map((tokenAddress) => ({ candidate, tokenAddress })),
  );
  const blockNumber = await getBlockNumber(client);
  const results = await multicall(client, {
    allowFailure: true,
    blockNumber,
    contracts: pairs.flatMap(({ candidate, tokenAddress }) => {
      const poolAddress = candidate.pool.address;
      const registryAddress = candidate.pool.tokenRegistryAddress;
      const limiterAddress = candidate.pool.limiterAddress;
      return [
        {
          address: tokenAddress,
          abi: erc20BalanceOfAbi,
          functionName: "balanceOf" as const,
          args: [holderAddress],
        },
        {
          address: tokenAddress,
          abi: erc20BalanceOfAbi,
          functionName: "balanceOf" as const,
          args: [poolAddress],
        },
        {
          address: registryAddress ?? poolAddress,
          abi: tokenIndexHaveAbi,
          functionName: "have" as const,
          args: [tokenAddress],
        },
        {
          address: limiterAddress ?? poolAddress,
          abi: limiterLimitOfAbi,
          functionName: "limitOf" as const,
          args: [tokenAddress, poolAddress],
        },
      ];
    }),
  });

  const creditableAddresses = new Set<string>();
  let hasVerificationGaps = false;
  for (const [index, pair] of pairs.entries()) {
    const base = index * CREDIT_READS_PER_PAIR;
    const outcome = poolCreditInputCapacity({
      walletBalanceRaw: rawAmount(results[base]),
      poolBalanceRaw: rawAmount(results[base + 1]),
      registryAddress: pair.candidate.pool.tokenRegistryAddress,
      registryAllowed: booleanValue(results[base + 2]),
      limiterAddress: pair.candidate.pool.limiterAddress,
      limitRaw: rawAmount(results[base + 3]),
    });
    if (outcome.creditable) {
      creditableAddresses.add(pair.candidate.pool.address.toLowerCase());
    }
    if (outcome.verificationGap) hasVerificationGaps = true;
  }

  return {
    pools: candidates
      .filter((candidate) => creditableAddresses.has(candidate.pool.address.toLowerCase()))
      .map((candidate) => candidate.pool),
    hasVerificationGaps,
    blockNumber,
  };
}

function rawAmount(entry: MulticallEntry): string | null {
  if (entry?.status !== "success" || typeof entry.result !== "bigint") return null;
  return entry.result.toString();
}

function booleanValue(entry: MulticallEntry): boolean | null {
  if (entry?.status !== "success" || typeof entry.result !== "boolean") return null;
  return entry.result;
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = Array.from<R>({ length: items.length });
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      const item = items[index];
      if (item !== undefined) results[index] = await task(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}
