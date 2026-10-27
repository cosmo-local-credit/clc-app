import { BackendApiError, isRetryableBackendError } from "@clc/api/client/errors";
import type { UserPool } from "@clc/api/features/pools/client";
import type { VoucherRef } from "@clc/core/features/catalog/logic";
import { tokenIndexHaveAbi } from "@clc/core/features/pool-admin/logic";
import {
  erc20BalanceOfAbi,
  poolAvailableLiquidityRaw,
  swapPoolFeesAbi,
} from "@clc/core/features/pool-swaps/logic";
import { useQuery } from "@tanstack/react-query";
import { getBlockNumber, multicall } from "viem/actions";
import { useClient } from "wagmi";

import { fetchFilteredPoolCatalog } from "#/features/pools/hooks/use-filtered-pools";

const CANDIDATE_STALE_TIME_MS = 10 * 60_000;
const AVAILABILITY_STALE_TIME_MS = 15_000;
const OUTPUT_READS_PER_POOL = 3;

const poolOutputAvailabilityKeys = {
  candidates: (voucher: VoucherRef) =>
    ["clc", "pools", "output-voucher-candidates", voucher.chainId, voucher.address] as const,
  availability: (voucher: VoucherRef, pools: readonly UserPool[]) =>
    [
      "pool-swap-tokens",
      "output-voucher-availability",
      voucher.chainId,
      voucher.address,
      pools.map((pool) => [
        pool.address.toLowerCase(),
        pool.tokenRegistryAddress?.toLowerCase() ?? null,
        pool.feesDecoupled,
      ]),
    ] as const,
};

export type PoolOutputAvailabilityResult = {
  pools: UserPool[];
  status: "idle" | "loading" | "ready" | "error";
  isRefreshing: boolean;
  hasVerificationGaps: boolean;
  retry: () => void;
  /** Either read is running, including again after `retry`. */
  retrying: boolean;
};

type OutputAvailabilityRead = {
  pools: UserPool[];
  hasVerificationGaps: boolean;
  blockNumber: bigint;
};

type MulticallEntry = { status: "success"; result: unknown } | { status: "failure" } | undefined;

/** Pools with current, fee-adjusted liquidity for one selected output voucher. */
export function usePoolOutputAvailability(
  voucher: VoucherRef | undefined,
): PoolOutputAvailabilityResult {
  const client = useClient();
  const candidates = useQuery({
    queryKey: voucher
      ? poolOutputAvailabilityKeys.candidates(voucher)
      : ["clc", "pools", "output-voucher-candidates", "none"],
    queryFn: async ({ signal }) => {
      if (!voucher) throw new Error("The output-voucher candidate query is missing its voucher.");
      try {
        return await fetchFilteredPoolCatalog({
          filter: {
            term: "",
            tags: [],
            tagMatch: "any",
            vouchers: [voucher],
            voucherMatch: "any",
          },
          signal,
          nearby: false,
        }).then((catalog) => catalog.pools);
      } catch (error) {
        // A syntactically valid deep-link address that is not in the catalog is
        // an empty relationship, not a reason to broaden back to every pool.
        if (error instanceof BackendApiError && error.kind === "validation") return [];
        throw error;
      }
    },
    enabled: voucher !== undefined,
    staleTime: CANDIDATE_STALE_TIME_MS,
    retry: (failureCount, error) => failureCount < 1 && isRetryableBackendError(error),
  });

  const candidatePools = candidates.data ?? [];
  const availability = useQuery({
    queryKey: voucher
      ? poolOutputAvailabilityKeys.availability(voucher, candidatePools)
      : ["pool-swap-tokens", "output-voucher-availability", "none"],
    queryFn: () => {
      if (!client || !voucher) {
        throw new Error("The output-voucher read is missing a chain client or voucher.");
      }
      return readPoolOutputAvailability(client, voucher.address, candidatePools);
    },
    enabled: Boolean(client && voucher && candidates.data && candidatePools.length > 0),
    retry: false,
    staleTime: AVAILABILITY_STALE_TIME_MS,
    refetchOnMount: "always",
  });

  if (!voucher) {
    return {
      pools: [],
      status: "idle",
      isRefreshing: false,
      hasVerificationGaps: false,
      retry: () => {},
      retrying: false,
    };
  }

  const initialError =
    !client ||
    (candidates.isError && candidates.data === undefined) ||
    (candidatePools.length > 0 && availability.isError && availability.data === undefined);
  const loading =
    !initialError &&
    (candidates.data === undefined ||
      (candidatePools.length > 0 && availability.data === undefined));
  const status: PoolOutputAvailabilityResult["status"] = initialError
    ? "error"
    : loading
      ? "loading"
      : "ready";
  const backgroundError = candidates.isError || availability.isError;
  const fetching = candidates.isFetching || availability.isFetching;

  return {
    pools: candidatePools.length === 0 ? [] : (availability.data?.pools ?? []),
    status,
    isRefreshing: status === "ready" && fetching,
    hasVerificationGaps:
      (availability.data?.hasVerificationGaps ?? false) || (status === "ready" && backgroundError),
    retry: () => {
      void candidates.refetch();
      if (candidatePools.length > 0) void availability.refetch();
    },
    retrying: fetching,
  };
}

async function readPoolOutputAvailability(
  client: Parameters<typeof getBlockNumber>[0],
  voucherAddress: `0x${string}`,
  pools: readonly UserPool[],
): Promise<OutputAvailabilityRead> {
  const blockNumber = await getBlockNumber(client);
  const results = await multicall(client, {
    allowFailure: true,
    blockNumber,
    contracts: pools.flatMap((pool) => [
      {
        address: voucherAddress,
        abi: erc20BalanceOfAbi,
        functionName: "balanceOf" as const,
        args: [pool.address],
      },
      {
        address: pool.address,
        abi: swapPoolFeesAbi,
        functionName: "fees" as const,
        args: [voucherAddress],
      },
      {
        // Keep a fixed stride. A registry-free pool admits any token, so this
        // placeholder result is ignored in the decision below.
        address: pool.tokenRegistryAddress ?? pool.address,
        abi: tokenIndexHaveAbi,
        functionName: "have" as const,
        args: [voucherAddress],
      },
    ]),
  });

  const available = new Set<string>();
  let hasVerificationGaps = false;
  for (const [index, pool] of pools.entries()) {
    const base = index * OUTPUT_READS_PER_POOL;
    const balanceRaw = rawAmount(results[base]);
    const feesRaw = rawAmount(results[base + 1]);
    const registryAllowed = booleanValue(results[base + 2]);

    if (
      balanceRaw === null ||
      (pool.feesDecoupled && feesRaw === null) ||
      (pool.tokenRegistryAddress && registryAllowed === null)
    ) {
      hasVerificationGaps = true;
      continue;
    }
    if (pool.tokenRegistryAddress && !registryAllowed) continue;

    const liquidityRaw = poolAvailableLiquidityRaw({
      balanceRaw,
      feesRaw: feesRaw ?? "0",
      feesDecoupled: pool.feesDecoupled,
    });
    if (isPositiveRaw(liquidityRaw)) available.add(pool.address.toLowerCase());
  }

  return {
    pools: pools.filter((pool) => available.has(pool.address.toLowerCase())),
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

function isPositiveRaw(value: string): boolean {
  try {
    return BigInt(value) > 0n;
  } catch {
    return false;
  }
}
