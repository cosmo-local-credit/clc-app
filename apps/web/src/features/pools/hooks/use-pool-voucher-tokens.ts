import { useMemo } from "react";
import { useConnection } from "wagmi";

import type { PoolVoucher } from "#/features/pools/api/pools-client";
import { poolVoucherToWalletToken } from "#/features/pools/logic/pool-voucher-display";
import { useAccountTokensInfinite } from "#/features/wallet/hooks/use-account-balances";

export function usePoolVoucherTokens(vouchers: PoolVoucher[]) {
  const { address } = useConnection();
  const accountTokensQuery = useAccountTokensInfinite(address);

  return useMemo(() => {
    const accountTokensByAddress = new Map(
      (accountTokensQuery.data?.pages.flatMap((page) => page.tokens) ?? []).map((token) => [
        token.tokenAddress.toLowerCase(),
        token,
      ]),
    );
    return vouchers.map((voucher) =>
      poolVoucherToWalletToken(
        voucher,
        accountTokensByAddress.get(voucher.tokenAddress.toLowerCase()),
      ),
    );
  }, [accountTokensQuery.data, vouchers]);
}
