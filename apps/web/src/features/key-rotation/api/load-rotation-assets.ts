import type { AccountToken, AccountTokensResult } from "@clc/api/features/accounts/client";
import type { UserPool } from "@clc/api/features/pools/client";
import { getClient } from "wagmi/actions";

import { accountsClient } from "#/lib/api/accounts";
import { poolsClient } from "#/lib/api/pools";
import { CHAIN_ID } from "#/lib/chain";
import { wagmiConfig } from "#/providers/web3-config";

import { discoverRotationAssets, type RotationAssets } from "./discover-rotation-assets";

const PER_PAGE = 100;

/**
 * Everything the old wallet could move, from the catalog's candidates and the
 * chain's answer. Pools come from the caller's owned pools with `owner` set to
 * the old card, which clc-core allows only for a card this account replaced,
 * so the same read works before the switch and after it.
 */
export async function loadRotationAssets(
  from: `0x${string}`,
  to: `0x${string}`,
): Promise<RotationAssets> {
  const client = getClient(wagmiConfig, { chainId: CHAIN_ID });
  if (!client) throw new Error("No RPC client is configured for this chain.");

  const [pools, vouchers, holdings] = await Promise.all([
    drainOwnedPools(from),
    drainTokens((cursor) => accountsClient.getAccountIssuedTokens(page(from, cursor))),
    drainTokens((cursor) => accountsClient.getAccountTokens(page(from, cursor))),
  ]);
  return discoverRotationAssets({ client, from, to, pools, vouchers, holdings });
}

function page(address: string, cursor: number | undefined) {
  return { address, perPage: PER_PAGE, cursor, next: cursor === undefined ? undefined : true };
}

async function drainTokens(
  fetchPage: (cursor: number | undefined) => Promise<AccountTokensResult>,
): Promise<AccountToken[]> {
  const tokens: AccountToken[] = [];
  let cursor: number | undefined;
  for (;;) {
    const result = await fetchPage(cursor);
    tokens.push(...result.tokens);
    if (result.tokens.length < PER_PAGE || result.last === undefined) return tokens;
    cursor = result.last;
  }
}

async function drainOwnedPools(owner: `0x${string}`): Promise<UserPool[]> {
  const pools: UserPool[] = [];
  let cursor: number | undefined;
  for (;;) {
    const result = await poolsClient.getOwnedPools({
      perPage: PER_PAGE,
      cursor,
      next: cursor === undefined ? undefined : true,
      owner,
    });
    pools.push(...result.pools);
    if (result.receivedCount < PER_PAGE || result.last === undefined) return pools;
    cursor = result.last;
  }
}
