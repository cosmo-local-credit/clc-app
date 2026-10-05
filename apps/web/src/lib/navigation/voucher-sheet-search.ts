import { isAddress } from "viem";
import { z } from "zod";

/** The card's tabs once it fills the screen, in the order they appear. */
export const VOUCHER_SHEET_TABS = ["offerings", "reviews", "overview"] as const;
export type VoucherSheetTab = (typeof VOUCHER_SHEET_TABS)[number];

/**
 * The search keys of any screen that opens vouchers in the card sheet.
 *
 * `voucher` is typed as a string because other routes name a `voucher` too,
 * and links spread one route's search into another's; `parseVoucherAddress`
 * admits only an address. An absent `voucherTab` means Offerings.
 */
export type VoucherSheetSearch = {
  voucher?: string;
  voucherTab?: Exclude<VoucherSheetTab, "offerings">;
};

/** The same keys for a route that validates its search with zod. */
export const voucherSheetSearchShape = {
  voucher: z.string().optional().catch(undefined),
  voucherTab: z.enum(["reviews", "overview"]).optional().catch(undefined),
};

/**
 * An address, or nothing. The checksum is not enforced: a voucher a catalog
 * spells in mixed case must still open its card.
 */
export function parseVoucherAddress(value: unknown): `0x${string}` | undefined {
  return typeof value === "string" && isAddress(value, { strict: false }) ? value : undefined;
}

export function parseVoucherSheetSearch(
  search: Record<string, unknown>,
): VoucherSheetSearch & { voucher?: `0x${string}` } {
  const voucher = parseVoucherAddress(search.voucher);
  const voucherTab =
    voucher && (search.voucherTab === "reviews" || search.voucherTab === "overview")
      ? search.voucherTab
      : undefined;
  return { voucher, voucherTab };
}
