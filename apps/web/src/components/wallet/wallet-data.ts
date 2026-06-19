/**
 * Static placeholder data for wallet screens.
 *
 * The real balances, vouchers, pools and address book will be sourced from
 * the backend / chain in later wiring. These keep the screens visually
 * complete while the data layer is built out.
 */

export type TokenKind = "stable" | "voucher";

export type WalletToken = {
  id: string;
  symbol: string;
  name: string;
  amount: string;
  fiat: string;
  color: string;
  kind: TokenKind;
  glyph?: string;
  /** When true, the connected wallet can mint/transfer on this token. */
  admin?: boolean;
  /** Voucher issuer metadata — only present on community vouchers. */
  location?: string;
  phone?: string;
  email?: string;
  owner?: string;
  ownerEns?: string;
};

export const WALLET_TOKENS: WalletToken[] = [
  {
    id: "usdc",
    symbol: "USDC",
    name: "USD Coin",
    amount: "245.00",
    fiat: "$245.00",
    color: "oklch(0.62 0.16 250)",
    kind: "stable",
    glyph: "$",
  },
  {
    id: "usdt",
    symbol: "USDT",
    name: "Tether USD",
    amount: "80.50",
    fiat: "$80.50",
    color: "oklch(0.6 0.12 170)",
    kind: "stable",
    glyph: "₮",
  },
  {
    id: "babas",
    symbol: "BABAS",
    name: "Baba's Vouchers",
    amount: "1,850.00",
    fiat: "≈ KSh 1,850",
    color: "oklch(0.66 0.18 50)",
    kind: "voucher",
    admin: true,
    location: "Mombasa, Kenya",
    phone: "+254 723 456 789",
    email: "babas@vouchers.co.ke",
    owner: "0xBa5eb14E9c1D7f3A0b6C2e8F4d1a9F57c3b2C0de",
    ownerEns: "babas.sarafu.eth",
  },
  {
    id: "grdn",
    symbol: "GRDN",
    name: "Community Garden",
    amount: "2,400.00",
    fiat: "≈ KSh 2,400",
    color: "oklch(0.58 0.16 150)",
    kind: "voucher",
    admin: true,
    location: "Kilifi, Kenya",
    phone: "+254 711 234 567",
    email: "garden@community.co.ke",
    owner: "0x7A23bE91d44C7f0a2E58c1B6aD3f0091Ef7C9F4c",
    ownerEns: "grdn.sarafu.eth",
  },
  {
    id: "bkr",
    symbol: "BKR",
    name: "Bakery Credit",
    amount: "1,120.00",
    fiat: "≈ KSh 1,120",
    color: "oklch(0.7 0.15 75)",
    kind: "voucher",
    location: "Nairobi, Kenya",
    phone: "+254 712 345 678",
    email: "cosmo@bakery.co.ke",
    owner: "0x4F2cA8103B6d9E7f1C5a8D2F4e6B0A3C7D9F1E2a",
  },
  {
    id: "solar",
    symbol: "SOLAR",
    name: "Local Solar Coop",
    amount: "450.00",
    fiat: "≈ KSh 450",
    color: "oklch(0.72 0.16 95)",
    kind: "voucher",
    location: "Eldoret, Kenya",
    phone: "+254 700 987 654",
    email: "coop@solar.co.ke",
    owner: "0x1A2b3C4d5E6f7A8b9C0d1E2f3A4b5C6d7E8f9A0b",
  },
];

export const WALLET_TOKEN_BY_ID: Record<string, WalletToken> = Object.fromEntries(
  WALLET_TOKENS.map((token) => [token.id, token]),
);

export type WalletPool = {
  id: string;
  name: string;
  pair: string;
  tvl: string;
};

export const WALLET_POOLS: WalletPool[] = [
  { id: "solar", name: "Local Solar Coop", pair: "USDC / SOLAR", tvl: "KSh 1.2M" },
  { id: "food", name: "Fresh Food Circle", pair: "USDC / BABAS", tvl: "KSh 840K" },
];

/** Total wallet balance, summed across placeholder tokens. */
export const WALLET_TOTAL_BALANCE = "KSh 12,840";

/** Connected wallet address used on Receive + receipts. */
export const WALLET_ADDRESS_FULL = "0x7A23bE91d44C7f0a2E58c1B6aD3f0091Ef7C9F4c";

export type Recipient = {
  id: string;
  label: string;
  /** Sub-label when there is no resolved on-chain address. */
  sub?: string;
  /** Hex address when the recipient has been resolved. */
  address?: string;
  /** Avatar hue seed (usually the label). */
  seed: string;
};

export const RECENT_RECIPIENTS: Recipient[] = [
  {
    id: "jamila",
    label: "jamila.clc",
    seed: "jamila",
    address: "0x91Ab3f5d6C7e8F9a0B1c2D3e4F5a6B7c8D9e0d2E7",
  },
  {
    id: "cosmo",
    label: "Cosmo Bakery",
    sub: "+254 712 004 118",
    seed: "cosmo",
  },
  {
    id: "0x4f2c",
    label: "0x4F2c…A810",
    sub: "Sent 2 days ago",
    seed: "0x4f2c",
    address: "0x4F2cA8103B6d9E7f1C5a8D2F4e6B0A3C7D9F1E2a",
  },
];

/** Deterministic hue from a seed string — used for avatar backgrounds. */
export function hueFromSeed(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) % 360;
  }
  return `oklch(0.58 0.16 ${h})`;
}

/** Default token used by Send + Swap placeholders. */
export const DEFAULT_SEND_TOKEN = WALLET_TOKEN_BY_ID.usdc;
