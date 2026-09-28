/**
 * apps/web's origin, which every bulk-issued card's QR links to. The console
 * never opens these links itself; it prints them for the holder's phone.
 */
export const PAPER_WALLET_ORIGIN: string =
  (import.meta.env.VITE_PAPER_WALLET_ORIGIN as string | undefined) ?? "https://cosmolocal.credit";
