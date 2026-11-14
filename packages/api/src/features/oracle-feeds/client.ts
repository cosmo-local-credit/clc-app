import { getAddress, isAddress } from "viem";
import { z } from "zod";
import type { HttpClient } from "../../client/http-client";

/**
 * A verified price feed from clc-core's `oracle_feeds` registry.
 *
 * The registry is the only list a steward picks from: the indexer names a pool
 * voucher's feed by looking its aggregator up here, so a feed set from anywhere
 * else reads back as unregistered.
 */
export type OracleFeed = {
  id: string;
  chainId: number;
  /** The registry key, usually the priced currency (`EUR`). */
  name: string;
  /** EIP-55 aggregator address. */
  address: `0x${string}`;
  /** The aggregator's `description()`, e.g. `EUR / USD`. Null on rows seeded before it was recorded. */
  description: string | null;
  decimals: number | null;
  /**
   * The per-feed freshness bound to send with the three-argument `setOracle`.
   * Null leaves the quoter's global bound in force.
   */
  maxStalenessSeconds: number | null;
};

const optionalText = z
  .string()
  .nullish()
  .transform((value) => value?.trim() || null);

const optionalNonNegativeInt = z
  .number()
  .int()
  .nonnegative()
  .nullish()
  .transform((value) => value ?? null);

const oracleFeedSchema = z
  .object({
    id: z.union([z.number(), z.string()]).transform(String),
    chainId: z.number().int().positive(),
    name: z.string().trim().min(1),
    address: z
      .string()
      .refine((value) => isAddress(value, { strict: false }))
      .transform((value) => getAddress(value)),
    description: optionalText,
    decimals: optionalNonNegativeInt,
    maxStalenessSeconds: optionalNonNegativeInt,
  })
  .transform(
    (feed): OracleFeed => ({
      ...feed,
      // Zero is the contract's "use the global bound", which is what null means here.
      maxStalenessSeconds: feed.maxStalenessSeconds ? feed.maxStalenessSeconds : null,
    }),
  );

export type OracleFeedsClient = ReturnType<typeof createOracleFeedsClient>;

export function createOracleFeedsClient(http: HttpClient) {
  return {
    /**
     * The verified feeds for one chain. Pass the app's configured chain: the
     * endpoint otherwise falls back to the service's own, which is not the
     * client's to assume.
     *
     * A malformed row is dropped rather than failing the list, so one bad seed
     * cannot take the picker down with it.
     */
    async listOracleFeeds(chainId: number, signal?: AbortSignal): Promise<OracleFeed[]> {
      const result = await http.request<{ feeds?: unknown }>(
        `/api/v2/oracle-feeds?chainId=${encodeURIComponent(String(chainId))}`,
        { method: "GET", cache: "no-store", signal },
      );
      if (!Array.isArray(result.feeds)) return [];
      return result.feeds.flatMap((row) => {
        const parsed = oracleFeedSchema.safeParse(row);
        return parsed.success && parsed.data.chainId === chainId ? [parsed.data] : [];
      });
    },
  };
}
