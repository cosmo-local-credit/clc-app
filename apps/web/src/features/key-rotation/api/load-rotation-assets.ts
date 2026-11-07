import type { UserPool } from "@clc/api/features/pools/client";
import { getClient } from "wagmi/actions";

import { accountsClient } from "#/lib/api/accounts";
import { poolsClient } from "#/lib/api/pools";
import { CHAIN_ID } from "#/lib/chain";
import { wagmiConfig } from "#/providers/web3-config";

import {
  discoverRotationAssets,
  type RotationAssets,
  type TokenCandidate,
} from "./discover-rotation-assets";

const PER_PAGE = 100;

/**
 * Everything the old wallet could move, from the catalog's candidates and the
 * chain's answer. Pools and vouchers come from the caller's owner lists with
 * `owner` set to the old card, which clc-core allows only for a card this
 * account replaced, so the same reads work before the switch and after it.
 * Both include retired assets, whose ownership still has to move.
 */
export async function loadRotationAssets(
  from: `0x${string}`,
  to: `0x${string}`,
): Promise<RotationAssets> {
  const client = getClient(wagmiConfig, { chainId: CHAIN_ID });
  if (!client) throw new Error("No RPC client is configured for this chain.");

  const [pools, vouchers, holdings] = await Promise.all([
    drainOwnedPools(from),
    drainOwnedVouchers(from),
    drainHoldings(from),
  ]);
  return discoverRotationAssets({ client, from, to, pools, vouchers, holdings });
}

function cursorPage(cursor: number | undefined) {
  return { perPage: PER_PAGE, cursor, next: cursor === undefined ? undefined : true };
}

async function drainHoldings(address: `0x${string}`): Promise<TokenCandidate[]> {
  const tokens: TokenCandidate[] = [];
  let cursor: number | undefined;
  for (;;) {
    const result = await accountsClient.getAccountTokens({ address, ...cursorPage(cursor) });
    tokens.push(
      ...result.tokens.map((token) => ({ address: token.tokenAddress, symbol: token.tokenSymbol })),
    );
    if (result.tokens.length < PER_PAGE || result.last === undefined) return tokens;
    cursor = result.last;
  }
}

/** Retired vouchers included: their ownership has to move too. */
async function drainOwnedVouchers(owner: `0x${string}`): Promise<TokenCandidate[]> {
  const vouchers: TokenCandidate[] = [];
  let cursor: number | undefined;
  for (;;) {
    const result = await accountsClient.getOwnedVouchers({ ...cursorPage(cursor), owner });
    vouchers.push(
      ...result.vouchers.map((voucher) => ({ address: voucher.address, symbol: voucher.symbol })),
    );
    if (result.vouchers.length < PER_PAGE || result.last === undefined) return vouchers;
    cursor = result.last;
  }
}

async function drainOwnedPools(owner: `0x${string}`): Promise<UserPool[]> {
  const pools: UserPool[] = [];
  let cursor: number | undefined;
  for (;;) {
    const result = await poolsClient.getOwnedPools({ ...cursorPage(cursor), owner });
    pools.push(...result.pools);
    if (result.receivedCount < PER_PAGE || result.last === undefined) return pools;
    cursor = result.last;
  }
}
