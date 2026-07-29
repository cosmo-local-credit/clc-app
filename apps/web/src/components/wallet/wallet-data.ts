/**
 * Static placeholder data for wallet screens.
 *
 * The real balances, vouchers, pools and address book will be sourced from
 * the backend / chain in later wiring. These keep the screens visually
 * complete while the data layer is built out.
 */

type TokenKind = "stable" | "voucher";

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
  contractAddress?: string;
  iconUrl?: string | null;
  tokenDecimals?: number;
  balance?: string;
  lastDateBlock?: string;
  lat?: number;
  lng?: number;
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
    contractAddress: "0x765DE816845861e75A25fCA122bb6898B8B1282a",
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
    contractAddress: "0x617f3112bf5397D0467D315cC709EF968D9ba546",
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
    contractAddress: "0xBaba5Eed3c1D7f3A0b6C2e8F4d1a9F57c3b2C0de",
    lat: -4.0435,
    lng: 39.6682,
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
    contractAddress: "0x6A23bE91d44C7f0a2E58c1B6aD3f0091Ef7C9F4d",
    lat: -3.6305,
    lng: 39.8499,
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
    contractAddress: "0x5F2cA8103B6d9E7f1C5a8D2F4e6B0A3C7D9F1E2b",
    lat: -1.2921,
    lng: 36.8219,
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
    contractAddress: "0x2A2b3C4d5E6f7A8b9C0d1E2f3A4b5C6d7E8f9A0c",
    lat: 0.5143,
    lng: 35.2698,
  },
];

export const WALLET_TOKEN_BY_ID: Record<string, WalletToken> = Object.fromEntries(
  WALLET_TOKENS.map((token) => [token.id, token]),
);

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

/**
 * Deterministic hue angle from a seed string. Callers pick their own lightness
 * and chroma, because a colour that carries white avatar initials is not the
 * same colour that has to stay legible behind 11px badge text.
 */
export function hueDegreesFromSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) % 360;
  }
  return h;
}

/** Deterministic hue from a seed string — used for avatar backgrounds. */
export function hueFromSeed(seed: string): string {
  return `oklch(0.58 0.16 ${hueDegreesFromSeed(seed)})`;
}
