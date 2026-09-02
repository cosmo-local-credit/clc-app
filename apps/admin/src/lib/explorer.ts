/**
 * Block explorer links for the chain this console is pointed at.
 *
 * Thin bindings over the shared chain table: every link here is for the
 * *configured* chain, so threading its metadata through each call site would
 * add noise without adding meaning. `chainLabel` is the exception — it names
 * the chain a given record settled on, which is a column on the row rather than
 * a deploy setting.
 */

import { chainMetadata, explorerAddressUrl, explorerTxUrl } from "@clc/core/lib/constants/chains";
import { CHAIN_INFO } from "#/lib/chain";

/**
 * The chain's name for a badge beside a record's id.
 *
 * A row from a chain this build carries no metadata for still renders: the
 * badge falls back to a neutral word rather than claiming the wrong network.
 */
export function chainLabel(chainId: number): string {
  return chainMetadata(chainId)?.name ?? "Chain";
}

export function txUrl(txHash: string): string {
  return explorerTxUrl(CHAIN_INFO, txHash);
}

export function addressUrl(address: string): string {
  return explorerAddressUrl(CHAIN_INFO, address);
}
