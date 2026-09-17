import { CELO_MAINNET_CHAIN_ID, CELO_MAINNET_CUSD_ADDRESS } from "../../lib/constants/celo";

// Pretium ramp constants shared across the wallet feature.

/**
 * Where a Pretium offramp (Withdraw) is wired up, and with what.
 *
 * Keyed by chain because both halves are chain-scoped and getting either wrong
 * loses money: the recipient triggers the upstream offramp worker, which
 * watches one chain, and the stables are matched by contract address. A chain
 * absent from this table has no offramp — sending to another chain's recipient
 * would transfer to an address nothing is watching.
 *
 * Backend token symbols are branded (cUSD surfaces as "USD₮"), so the address
 * is the stable key and `symbol` is the label we show. The transfer always uses
 * the balance's real address and decimals.
 */
const PRETIUM_OFFRAMP: Record<
  number,
  { recipient: `0x${string}`; tokens: readonly { address: string; symbol: string }[] }
> = {
  [CELO_MAINNET_CHAIN_ID]: {
    // Sending a supported stable here triggers the upstream offramp worker,
    // which resolves the payout phone from the address→phone link and pays out
    // over MPESA.
    recipient: "0x8005ee53E57aB11E11eAA4EFe07Ee3835Dc02F98",
    tokens: [
      { address: CELO_MAINNET_CUSD_ADDRESS, symbol: "USDm" }, // Celo Dollar (cUSD)
      { address: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e", symbol: "USDT" }, // Tether USD₮
      { address: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C", symbol: "USDC" }, // USD Coin
    ],
  },
};

/**
 * Whether Pretium's MPESA ramps are wired up on this chain at all.
 *
 * Both directions ride the same deployment, so a chain with no offramp has no
 * onramp either: the entry points are hidden rather than shown and then failing
 * on every call to a service that is not there.
 */
export function chainHasPretiumRamp(chainId: number): boolean {
  return PRETIUM_OFFRAMP[chainId] !== undefined;
}

/** The offramp recipient for a chain, or undefined where there is no offramp. */
export function pretiumOfframpRecipient(chainId: number): `0x${string}` | undefined {
  return PRETIUM_OFFRAMP[chainId]?.recipient;
}

/** Returns the offramp display symbol for a token address, or null if unsupported. */
export function offrampTokenSymbol(chainId: number, address: string): string | null {
  const match = PRETIUM_OFFRAMP[chainId]?.tokens.find(
    (token) => token.address.toLowerCase() === address.toLowerCase(),
  );
  return match ? match.symbol : null;
}
