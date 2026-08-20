/**
 * Block explorer links for the chain this console is pointed at.
 *
 * Kept app-local because it reads `import.meta.env`, which no package may do,
 * and because the console is the only surface that links out: apps/web shows a
 * receipt for a transaction the user just made and hardcodes the mainnet host,
 * while an operator may be reading a staging console pointed at Alfajores. A
 * link to the wrong network's explorer answers "no such transaction", which
 * reads as data loss rather than as a misconfiguration.
 */

const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID ?? "42220");

const CHAIN_NAMES: Record<number, string> = {
  42220: "Celo",
  44787: "Alfajores",
};

/**
 * The chain's name for a badge beside a record's id.
 *
 * Lives here rather than in a formatter because it answers the same question the
 * explorer host does — which network this row is on — and a staging console
 * pointed at Alfajores must not read as mainnet.
 */
export function chainLabel(chainId: number): string {
  return CHAIN_NAMES[chainId] ?? "Chain";
}

const EXPLORERS: Record<number, string> = {
  42220: "https://celoscan.io",
  44787: "https://alfajores.celoscan.io",
};

/** Celo mainnet is the fallback: it is what every deployed environment uses. */
const EXPLORER_URL = EXPLORERS[CHAIN_ID] ?? EXPLORERS[42220];

export function explorerTxUrl(txHash: string): string {
  return `${EXPLORER_URL}/tx/${txHash}`;
}

export function explorerAddressUrl(address: string): string {
  return `${EXPLORER_URL}/address/${address}`;
}
