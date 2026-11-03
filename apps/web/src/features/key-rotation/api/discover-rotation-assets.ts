import type { UserPool } from "@clc/api/features/pools/client";
import {
  giftableTokenApplyExpiryAbi,
  poolRotationCalls,
  type RotationAssetKind,
  type RotationGroup,
} from "@clc/core/features/key-rotation/logic";
import {
  ownableAbi,
  swapPoolFeeAddressAbi,
  swapPoolSealAbi,
} from "@clc/core/features/pool-admin/logic";
import { erc20BalanceOfAbi } from "@clc/core/features/pool-swaps/logic";
import { buildVoucherOwnershipTransferCall } from "@clc/core/features/vouchers/logic";
import { type Client, getAddress, isAddressEqual } from "viem";
import { call, getBalance, readContract, simulateContract } from "viem/actions";

import { preparePoolOwnershipTransfer } from "#/features/pools/hooks/use-pool-ownership-transfer";
import { buildVoucherTransferCall } from "#/features/wallet/api/send-voucher-relay";

/** A group labelled for people: a pool's or voucher's name, a token's symbol. */
export type LabelledRotationGroup = RotationGroup & { label: string };

export type SkippedReason = "expired" | "sealed-fee-address" | "would-fail";

export type SkippedAsset = {
  kind: RotationAssetKind;
  address: `0x${string}`;
  label: string;
  reason: SkippedReason;
};

export type RotationAssets = {
  groups: LabelledRotationGroup[];
  /** Left on the old card, each with the reason. Never fatal to the rest. */
  skipped: SkippedAsset[];
};

/** A catalog nomination: a contract and what to call it. */
export type TokenCandidate = { address: string; symbol: string };

export type DiscoverRotationAssetsInput = {
  client: Client;
  from: `0x${string}`;
  to: `0x${string}`;
  /** Pools the catalog says `from` owns, retired ones included. */
  pools: UserPool[];
  /** Vouchers the catalog says `from` owns, retired ones included. */
  vouchers: TokenCandidate[];
  /** Tokens the indexer has seen `from` hold. */
  holdings: TokenCandidate[];
};

/**
 * Decides, from chain state, what the old wallet can move to the new one.
 *
 * The catalog only nominates candidates. Ownership is read with `owner()`, so a
 * Safe-owned asset — whose owner is the Safe, not the card — never qualifies,
 * and a balance is the token's own `balanceOf`, never the indexer's figure.
 * Every group is then simulated call by call as the old wallet; one that would
 * revert is reported and left out rather than taking a batch down with it.
 */
export async function discoverRotationAssets(
  input: DiscoverRotationAssetsInput,
): Promise<RotationAssets> {
  const { client, from, to } = input;
  const candidates: LabelledRotationGroup[] = [];
  const skipped: SkippedAsset[] = [];

  for (const pool of input.pools) {
    if (!pool.ownerAddress || !isAddressEqual(pool.ownerAddress, from)) continue;
    const label = pool.name;
    try {
      const handoverCalls = await preparePoolOwnershipTransfer(client, pool, {
        assetAddress: pool.address,
        ownerAddress: from,
        newOwnerAddress: to,
      });
      const [feeAddress, sealState] = await Promise.all([
        readContract(client, {
          address: pool.address,
          abi: swapPoolFeeAddressAbi,
          functionName: "feeAddress",
        }),
        readContract(client, {
          address: pool.address,
          abi: swapPoolSealAbi,
          functionName: "sealState",
        }),
      ]);
      const rotation = poolRotationCalls({
        from,
        to,
        poolAddress: pool.address,
        feeAddress,
        sealState,
        handoverCalls,
      });
      if (rotation.feeAddress === "sealed") {
        skipped.push({ kind: "pool", address: pool.address, label, reason: "sealed-fee-address" });
      }
      candidates.push({ kind: "pool", address: pool.address, label, calls: rotation.calls });
    } catch {
      skipped.push({ kind: "pool", address: pool.address, label, reason: "would-fail" });
    }
  }

  // Every read below is about one contract, so a contract that answers badly
  // costs only its own row: it is listed as left behind, and the rest move.
  for (const voucher of input.vouchers) {
    const address = getAddress(voucher.address);
    let owner: `0x${string}`;
    try {
      owner = await readContract(client, { address, abi: ownableAbi, functionName: "owner" });
    } catch {
      skipped.push({ kind: "voucher", address, label: voucher.symbol, reason: "would-fail" });
      continue;
    }
    if (!isAddressEqual(owner, from)) continue;
    candidates.push({
      kind: "voucher",
      address,
      label: voucher.symbol,
      calls: [buildVoucherOwnershipTransferCall({ tokenAddress: address, newOwnerAddress: to })],
    });
  }

  const tokens = new Map<`0x${string}`, TokenCandidate>();
  for (const token of [...input.holdings, ...input.vouchers]) {
    tokens.set(getAddress(token.address), token);
  }
  for (const [tokenAddress, token] of tokens) {
    let balance: bigint;
    try {
      balance = await readContract(client, {
        address: tokenAddress,
        abi: erc20BalanceOfAbi,
        functionName: "balanceOf",
        args: [from],
      });
    } catch {
      skipped.push({
        kind: "balance",
        address: tokenAddress,
        label: token.symbol,
        reason: "would-fail",
      });
      continue;
    }
    if (balance === 0n) continue;
    if (await isExpired(client, tokenAddress, from)) {
      skipped.push({
        kind: "balance",
        address: tokenAddress,
        label: token.symbol,
        reason: "expired",
      });
      continue;
    }
    candidates.push({
      kind: "balance",
      address: tokenAddress,
      label: token.symbol,
      calls: [
        buildVoucherTransferCall({
          tokenAddress,
          recipientAddress: to,
          amountRaw: balance.toString(),
        }),
      ],
    });
  }

  const native = await getBalance(client, { address: from });
  if (native > 0n) {
    candidates.push({
      kind: "native",
      address: from,
      label: client.chain?.nativeCurrency.symbol ?? "",
      calls: [{ to, value: native.toString(), data: "0x" }],
    });
  }

  const groups: LabelledRotationGroup[] = [];
  for (const group of candidates) {
    if (await groupSucceeds(client, from, group)) {
      groups.push(group);
    } else {
      skipped.push({
        kind: group.kind,
        address: group.address,
        label: group.label,
        reason: "would-fail",
      });
    }
  }
  return { groups, skipped };
}

/**
 * A token that is not a GiftableToken has no `applyExpiry` and cannot expire,
 * so a failed simulation reads as not expired; a transfer that would still
 * fail is caught by the group simulation.
 */
async function isExpired(client: Client, token: `0x${string}`, from: `0x${string}`) {
  try {
    const { result } = await simulateContract(client, {
      address: token,
      abi: giftableTokenApplyExpiryAbi,
      functionName: "applyExpiry",
      account: from,
    });
    return result !== 0;
  } catch {
    return false;
  }
}

async function groupSucceeds(client: Client, from: `0x${string}`, group: RotationGroup) {
  try {
    for (const entry of group.calls) {
      await call(client, {
        account: from,
        to: entry.to,
        data: entry.data,
        value: BigInt(entry.value),
      });
    }
    return true;
  } catch {
    return false;
  }
}
