import { chainHasPretiumRamp, offrampTokenSymbol } from "@clc/core/features/wallet/pretium";
import { useMemo } from "react";
import { formatUnits } from "viem";

import { useAuthProfile } from "#/features/auth/hooks/use-profile";
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
  const profile = useAuthProfile({ enabled: Boolean(address), recoverReads: true });
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
  const unit = address
    ? walletValuationUnit(
        profile.data?.preferredCurrency,
        held.map((token) => (stable(token.tokenAddress) ? undefined : token.voucherUoa)),
      )
    : null;
  const rampsDollars = chainHasPretiumRamp(CHAIN_ID) && unit === PRETIUM_CURRENCY;
  const rates = usePretiumRates(rampsDollars, { recoverReads: true });

  const values = new Map<string, HoldingValue>();
  if (unit) {
    for (const token of held) {
      const isStable = stable(token.tokenAddress);
      values.set(
        token.tokenAddress.toLowerCase(),
        valueHolding(
          {
            amount: formatUnits(BigInt(token.balance), token.tokenDecimals),
            stable: isStable,
            rate: isStable
              ? null
              : { value: token.voucherValue ?? null, unit: token.voucherUoa ?? null },
          },
          unit,
          rampsDollars
            ? {
                unit: PRETIUM_CURRENCY,
                value: rates.isPending ? undefined : (rates.data?.buy ?? null),
              }
            : null,
        ),
      );
    }
  }
  const total = walletTotal([...values.values()]);
  const balancesComplete = Boolean(tokensQuery.data && !tokensQuery.hasNextPage);
  const awaitingValuation =
    (profile.isPending && profile.fetchStatus !== "idle") || total.status === "pending";
  const isPending =
    Boolean(address) &&
    ((tokensQuery.isPending && (!tokensQuery.isError || tokensQuery.isFetching)) ||
      (balancesComplete && awaitingValuation));

  return {
    unit,
    /** Keyed by lower-case token address. */
    values,
    // A cursor failure leaves earlier rows in the cache. Those rows are valid
    // individually, but their subtotal must not stand in for the entire wallet.
    total: address && balancesComplete && !awaitingValuation ? total.total : null,
    isPending,
    isError: tokensQuery.isError,
    isRetrying: tokensQuery.isFetching,
    retry: () =>
      tokensQuery.isFetchNextPageError ? tokensQuery.fetchNextPage() : tokensQuery.refetch(),
  };
}
