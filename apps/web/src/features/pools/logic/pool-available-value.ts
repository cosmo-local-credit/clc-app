import { formatOfferingDisplayPrice } from "@clc/core/features/market/logic";
import { formatTokenAmount } from "@clc/core/features/wallet/logic";

export type PoolAvailableValue = {
  value: string;
  unit: string;
};

/**
 * Pool holdings of a voucher, converted into the voucher's unit of account.
 *
 * A zero or unreadable balance is not a rate of zero — it is nothing to swap
 * into — so this returns null rather than "0 KES".
 */
export function formatPoolAvailableValue({
  balanceRaw,
  decimals,
  voucherValue,
  voucherUoa,
}: {
  balanceRaw: string | null | undefined;
  decimals: number | null;
  voucherValue: string | null;
  voucherUoa: string | null;
}): PoolAvailableValue | null {
  if (!balanceRaw || balanceRaw === "0") return null;

  let amount: string;
  try {
    amount = formatTokenAmount(balanceRaw, decimals ?? 18, 6);
  } catch {
    return null;
  }
  if (amount === "0") return null;

  return formatOfferingDisplayPrice(amount, voucherValue, voucherUoa, "");
}
