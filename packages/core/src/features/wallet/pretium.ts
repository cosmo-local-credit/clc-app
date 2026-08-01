// Pretium ramp constants shared across the wallet feature.

/**
 * Fixed on-chain recipient for Pretium offramps (Withdraw). Sending a supported
 * stable to this address triggers the upstream offramp worker, which resolves
 * the payout phone from the address→phone link and pays out over MPESA.
 */
export const PRETIUM_OFFRAMP_RECIPIENT = "0x8005ee53E57aB11E11eAA4EFe07Ee3835Dc02F98";

/**
 * Stables Pretium supports for offramp on Celo mainnet, matched by contract
 * address. Backend token symbols are branded (e.g. cUSD surfaces as "USD₮"),
 * so the address is the stable key; `symbol` is the label we show. cUSD is
 * shown as USDm. The transfer always uses the balance's real address/decimals.
 */
const PRETIUM_OFFRAMP_TOKENS = [
  { address: "0x765DE816845861e75A25fCA122bb6898B8B1282a", symbol: "USDm" }, // Celo Dollar (cUSD)
  { address: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e", symbol: "USDT" }, // Tether USD₮
  { address: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C", symbol: "USDC" }, // USD Coin
] as const;

/** Returns the offramp display symbol for a token address, or null if unsupported. */
export function offrampTokenSymbol(address: string): string | null {
  const match = PRETIUM_OFFRAMP_TOKENS.find(
    (token) => token.address.toLowerCase() === address.toLowerCase(),
  );
  return match ? match.symbol : null;
}
