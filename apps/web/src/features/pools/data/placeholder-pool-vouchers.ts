import type { PoolVoucher } from "#/features/pools/api/pools-client";

/**
 * Compatibility type for the existing pool views. Voucher data now comes from
 * the pool-vouchers API; the alias can be removed when those views are renamed.
 */
export type PoolVoucherPlaceholder = PoolVoucher;
