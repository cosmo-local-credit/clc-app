import { chainHasPretiumRamp, offrampTokenSymbol } from "@clc/core/features/wallet/pretium";
import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { formatUnits } from "viem";

import { useAuthProfile } from "#/features/auth/hooks/use-profile";
import { marketVoucherDetailQuery } from "#/features/home/hooks/use-market-voucher-detail";
import { useAllAccountTokens } from "#/features/wallet/hooks/use-account-balances";
import { usePretiumRates } from "#/features/wallet/hooks/use-pretium";
import {
  type HoldingValue,
  valueHolding,
  walletTotal,
  walletValuationUnit,
} from "#/features/wallet/logic/holdings-valuation";
import { CHAIN_ID } from "#/lib/chain";

/** The currency Pretium's cash-out rate is quoted in. */
const PRETIUM_CURRENCY = "KES";

/**
 * Every positive balance on the account restated in one unit, with the total.
 *
 * The unit is the person's preferred currency from their profile. Each voucher
 * is valued at its issuer's stated rate (the same `voucherValue`/`voucherUoa`
 * the Send screen shows as Value); a stable counts as a dollar, and dollars
 * become shillings only at the rate a cash-out would pay. A holding with no
 * rate in the unit stays out of the total and is reported as `unpriced`.
 */
export function useWalletValuation(address: string | undefined) {
  const tokensQuery = useAllAccountTokens(address);
  const profile = useAuthProfile({ enabled: Boolean(address) });
  const held = useMemo(
    () =>
      tokensQuery.tokens.filter((token) => {
        try {
          return BigInt(token.balance) > 0n;
        } catch {
          return false;
        }
      }),
    [tokensQuery.tokens],
  );
  const stable = (tokenAddress: string) => offrampTokenSymbol(CHAIN_ID, tokenAddress) !== null;
  const details = useQueries({
    queries: held.map((token) => ({
      ...marketVoucherDetailQuery(token.tokenAddress),
      enabled: !stable(token.tokenAddress),
      retry: false,
    })),
  });

  const unit = walletValuationUnit(
    profile.data?.preferredCurrency,
    details.map((detail) => detail.data?.voucherUoa),
  );
  const rampsDollars = chainHasPretiumRamp(CHAIN_ID) && unit === PRETIUM_CURRENCY;
  const rates = usePretiumRates(rampsDollars);

  const values = new Map<string, HoldingValue>();
  if (unit) {
    held.forEach((token, index) => {
      const detail = details[index];
      const isStable = stable(token.tokenAddress);
      values.set(
        token.tokenAddress.toLowerCase(),
        valueHolding(
          {
            amount: formatUnits(BigInt(token.balance), token.tokenDecimals),
            stable: isStable,
            rate: isStable
              ? null
              : detail?.isPending
                ? undefined
                : detail?.data
                  ? { value: detail.data.voucherValue, unit: detail.data.voucherUoa }
                  : null,
          },
          unit,
          rampsDollars
            ? {
                unit: PRETIUM_CURRENCY,
                value: rates.isPending ? undefined : rates.isError ? null : rates.data?.buy,
              }
            : null,
        ),
      );
    });
  }
  const total = walletTotal([...values.values()]);

  return {
    unit,
    /** Keyed by lower-case token address. */
    values,
    total: total.total,
    unpriced: total.unpriced,
    isPending:
      Boolean(address) &&
      (tokensQuery.isPending ||
        (profile.isPending && profile.fetchStatus !== "idle") ||
        total.status === "pending"),
    isError: tokensQuery.isError,
  };
}
