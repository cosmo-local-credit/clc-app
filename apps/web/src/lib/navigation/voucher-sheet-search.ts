import { isAddress } from "viem";

/**
 * `?voucher=` on the market map: a link that centres the map on a voucher and
 * selects its pin. Older links on other screens redirect to the voucher page.
 *
 * `voucher` is typed as a string because other routes name a `voucher` too,
 * and links spread one route's search into another's; `parseVoucherAddress`
 * admits only an address. Legacy `voucherTab` values are intentionally ignored.
 */
export type VoucherSheetSearch = {
  voucher?: string;
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
  return { voucher };
}
