import { CELO_ALFAJORES_CHAIN_ID, CELO_MAINNET_CHAIN_ID } from "./celo";
import { GNOSIS_MAINNET_CHAIN_ID } from "./gnosis";

/**
 * The settlement chains this product can be pointed at.
 *
 * One table, in core, because both apps answer the same three questions about
 * whichever chain they were built for — what to call it, what its gas token is,
 * and where to link a hash — and they used to answer them separately: apps/web
 * hardcoded `celoscan.io` in five receipt screens while apps/admin kept its own
 * two-entry map. A deploy pointed at Gnosis then showed Celo links on one
 * surface and correct ones on the other.
 *
 * Chain selection itself stays in the apps: only they may read
 * `import.meta.env.VITE_CHAIN_ID`.
 */
export type ChainMetadata = {
  /** Short label shown beside a record's chain id. */
  name: string;
  /** Native gas token symbol — what a relayer balance is denominated in. */
  nativeSymbol: string;
  /** Block explorer origin, no trailing slash. */
  explorerUrl: string;
  /** What to call that explorer on a button that opens it. */
  explorerName: string;
};

const CHAIN_METADATA = {
  [CELO_MAINNET_CHAIN_ID]: {
    name: "Celo",
    nativeSymbol: "CELO",
    explorerUrl: "https://celoscan.io",
    explorerName: "Celoscan",
  },
  [CELO_ALFAJORES_CHAIN_ID]: {
    name: "Alfajores",
    nativeSymbol: "CELO",
    explorerUrl: "https://alfajores.celoscan.io",
    explorerName: "Celoscan",
  },
  [GNOSIS_MAINNET_CHAIN_ID]: {
    name: "Gnosis",
    nativeSymbol: "xDAI",
    explorerUrl: "https://gnosisscan.io",
    explorerName: "Gnosisscan",
  },
} as const satisfies Record<number, ChainMetadata>;

/**
 * Metadata for a chain, or undefined when the id is one we carry nothing for.
 *
 * Deliberately not defaulted to Celo. A caller that falls back to mainnet
 * renders a link answering "no such transaction", which reads as data loss
 * rather than as the misconfiguration it is.
 */
export function chainMetadata(chainId: number): ChainMetadata | undefined {
  return CHAIN_METADATA[chainId as keyof typeof CHAIN_METADATA];
}

export function explorerTxUrl(chainId: number, txHash: string): string | undefined {
  const chain = chainMetadata(chainId);
  return chain ? `${chain.explorerUrl}/tx/${txHash}` : undefined;
}

export function explorerAddressUrl(chainId: number, address: string): string | undefined {
  const chain = chainMetadata(chainId);
  return chain ? `${chain.explorerUrl}/address/${address}` : undefined;
}
