import type { PoolVoucher, UserPool } from "@clc/api/features/pools/client";
import {
  buildSetPoolFeeCalls,
  buildWithdrawPoolLiquidityCalls,
  POOL_FEE_PERCENT_DECIMALS,
} from "@clc/core/features/pool-admin/logic";
import { buildCollectPoolFeesCalls } from "@clc/core/features/pool-swaps/logic";
import { formatTokenAmount, parseTokenAmount } from "@clc/core/features/wallet/logic";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { toast } from "sonner";
import { isAddress, zeroAddress } from "viem";
import { useConnection } from "wagmi";

import { useAssetOwnerInfo } from "#/features/ownership/hooks/use-asset-owner-info";
import { usePoolAdminRelay } from "#/features/pools/hooks/use-pool-admin";
import {
  type PoolFeeSettings,
  usePoolFeeSettings,
} from "#/features/pools/hooks/use-pool-fee-settings";
import { usePoolTreasury } from "#/features/pools/hooks/use-pool-treasury";
import { poolWithdrawalTokens } from "#/features/pools/logic/pool-withdrawal-tokens";
import { useAllAccountTokens } from "#/features/wallet/hooks/use-account-balances";

/**
 * What a steward's control surface reads once: the owner, the vouchers the
 * pool can pay out, their withdrawable balances and the on-chain fee policy.
 * Balances are read for the withdraw forms alone, so a superadmin who can only
 * edit the record never pays for the calls.
 */
export function usePoolControls(
  pool: UserPool,
  vouchers: PoolVoucher[],
  canManageOnChain: boolean,
) {
  const owner = useAssetOwnerInfo(pool.address, pool.ownerAddress);
  const indexed = useAllAccountTokens(canManageOnChain ? pool.address : undefined);
  const withdrawalVouchers = poolWithdrawalTokens(vouchers, indexed.tokens, pool.chainId);
  const treasury = usePoolTreasury(
    pool,
    withdrawalVouchers.map((voucher) => voucher.tokenAddress),
    canManageOnChain,
  );
  const feeSettings = usePoolFeeSettings(pool, canManageOnChain);
  return { owner, indexed, withdrawalVouchers, treasury, feeSettings, fee: feeSettings.data };
}

/**
 * Sends pool liquidity to the owner's own wallet.
 *
 * Recipient is not a field: `withdrawLiquidity` is the emergency exit, the
 * caller is already the only address allowed to make it, and offering a
 * free-text destination turns a typo into an irrecoverable transfer.
 */
export function usePoolWithdrawLiquidityForm({
  pool,
  vouchers,
  treasury,
  onDone,
}: {
  pool: UserPool;
  vouchers: PoolVoucher[];
  treasury: Map<string, { withdrawableRaw: string }> | undefined;
  onDone: () => void;
}) {
  const { t } = useLingui();
  const { address } = useConnection();
  const relay = usePoolAdminRelay(pool);
  const owner = useAssetOwnerInfo(pool.address, pool.ownerAddress);
  const [tokenAddress, setTokenAddress] = useState<string | null>(null);
  const [amount, setAmount] = useState("");

  const selected = vouchers.find((voucher) => voucher.tokenAddress.toLowerCase() === tokenAddress);
  const decimals = selected?.decimals ?? null;
  const withdrawableRaw = tokenAddress ? treasury?.get(tokenAddress)?.withdrawableRaw : undefined;
  const withdrawable =
    withdrawableRaw !== undefined && decimals !== null
      ? formatTokenAmount(withdrawableRaw, decimals, 2)
      : null;

  const submit = async () => {
    if (!selected || decimals === null || !address) return;
    let amountRaw: string;
    try {
      amountRaw = parseTokenAmount(amount.trim(), decimals);
    } catch {
      toast.error(t`Enter an amount this voucher supports.`);
      return;
    }
    if (BigInt(amountRaw) <= 0n) {
      toast.error(t`Enter an amount greater than zero.`);
      return;
    }
    if (withdrawableRaw !== undefined && BigInt(amountRaw) > BigInt(withdrawableRaw)) {
      toast.error(t`The pool doesn't hold that much ${selected.symbol}.`);
      return;
    }

    try {
      await relay.mutateAsync(
        buildWithdrawPoolLiquidityCalls({
          poolAddress: pool.address,
          tokenAddress: selected.tokenAddress,
          // A Safe-owned pool pays its owner, the Safe; otherwise the connected owner.
          recipientAddress: owner.info?.kind === "safe" ? owner.info.owner : address,
          amountRaw,
        }),
      );
      toast.success(t`${amount} ${selected.symbol} withdrawn.`);
      onDone();
    } catch (error) {
      if (relay.reportError(error, t`The transaction failed.`)) onDone();
    }
  };

  return {
    relay,
    tokenAddress,
    selectToken: (next: string) => {
      setTokenAddress(next);
      setAmount("");
    },
    amount,
    setAmount,
    selected,
    withdrawable,
    canSubmit: !!selected && !!amount.trim(),
    submit,
    amountFor: (voucher: PoolVoucher) => {
      const entry = treasury?.get(voucher.tokenAddress.toLowerCase());
      if (!entry || voucher.decimals === null) return null;
      return `${formatTokenAmount(entry.withdrawableRaw, voucher.decimals, 2)} ${voucher.symbol}`;
    },
  };
}

/**
 * Pays out everything accrued in one voucher. `withdraw(token)` sends the whole
 * balance to the pool's own `feeAddress`, never to the caller, so the
 * destination is shown rather than chosen.
 */
export function usePoolCollectFeesForm({
  pool,
  vouchers,
  treasury,
  onDone,
}: {
  pool: UserPool;
  vouchers: PoolVoucher[];
  treasury: Map<string, { feesRaw: string }> | undefined;
  onDone: () => void;
}) {
  const { t } = useLingui();
  const relay = usePoolAdminRelay(pool);
  const [tokenAddress, setTokenAddress] = useState<string | null>(null);

  const selected = vouchers.find((voucher) => voucher.tokenAddress.toLowerCase() === tokenAddress);
  const accruedRaw = tokenAddress ? treasury?.get(tokenAddress)?.feesRaw : undefined;

  const submit = async () => {
    if (!selected) return;
    if (accruedRaw !== undefined && BigInt(accruedRaw) === 0n) {
      toast.error(t`No ${selected.symbol} fees have accrued yet.`);
      return;
    }
    try {
      await relay.mutateAsync(
        buildCollectPoolFeesCalls({
          poolAddress: pool.address,
          tokenOut: selected.tokenAddress,
        }),
      );
      toast.success(t`${selected.symbol} fees sent to the fee recipient.`);
      onDone();
    } catch (error) {
      if (relay.reportError(error, t`The transaction failed.`)) onDone();
    }
  };

  return {
    relay,
    tokenAddress,
    selectToken: setTokenAddress,
    selected,
    submit,
    amountFor: (voucher: PoolVoucher) => {
      const entry = treasury?.get(voucher.tokenAddress.toLowerCase());
      if (!entry || voucher.decimals === null) return null;
      return `${formatTokenAmount(entry.feesRaw, voucher.decimals, 2)} ${voucher.symbol}`;
    },
  };
}

/**
 * The pool's swap fee and the account it is paid to, changed together.
 *
 * Two contracts — the fee is the FeePolicy's `defaultFee`, the recipient is
 * SwapPool's `feeAddress` — and therefore two calls, relayed as one batch so a
 * steward never signs twice for one decision or lands halfway. Whichever field
 * is unchanged is left out of the batch rather than re-sent. Both fields start
 * from the chain read, so the form shows what the pool actually charges.
 */
export function usePoolFeeSettingsForm({
  pool,
  settings,
  onDone,
}: {
  pool: UserPool;
  settings: PoolFeeSettings | undefined;
  onDone: () => void;
}) {
  const { t } = useLingui();
  const relay = usePoolAdminRelay(pool);
  const { address } = useConnection();
  const [feePercent, setFeePercent] = useState(settings?.feePercent ?? "");
  // Blank rather than the connected wallet when the pool has none: seeding the
  // owner's address here would present a recipient the pool does not have as
  // one it does, and `withdraw` would keep reverting until it was submitted.
  const [recipient, setRecipient] = useState<string>(settings?.feeAddress ?? "");

  const trimmedFee = feePercent.trim();
  const feeIsValid =
    trimmedFee !== "" &&
    /^\d+(\.\d{1,4})?$/.test(trimmedFee) &&
    Number(trimmedFee) >= 0 &&
    Number(trimmedFee) <= 100;
  const trimmedRecipient = recipient.trim();
  const recipientIsValid =
    isAddress(trimmedRecipient) && trimmedRecipient.toLowerCase() !== zeroAddress;

  const feeChanged = feeIsValid && trimmedFee !== settings?.feePercent;
  const recipientChanged =
    recipientIsValid && trimmedRecipient.toLowerCase() !== settings?.feeAddress?.toLowerCase();
  const canSubmit = feeIsValid && recipientIsValid && (feeChanged || recipientChanged);

  const submit = async () => {
    if (!canSubmit) return;
    try {
      await relay.mutateAsync(
        buildSetPoolFeeCalls({
          poolAddress: pool.address,
          feePolicyAddress: pool.feePolicyAddress,
          ...(feeChanged
            ? { feePpm: parseTokenAmount(trimmedFee, POOL_FEE_PERCENT_DECIMALS) }
            : {}),
          ...(recipientChanged ? { feeAddress: trimmedRecipient as `0x${string}` } : {}),
        }),
      );
      toast.success(t`Pool fee updated.`);
      onDone();
    } catch (error) {
      if (relay.reportError(error, t`The transaction failed.`)) onDone();
    }
  };

  return {
    relay,
    connectedAddress: address,
    feePercent,
    setFeePercent,
    recipient,
    setRecipient,
    trimmedFee,
    feeIsValid,
    trimmedRecipient,
    recipientIsValid,
    canSubmit,
    submit,
  };
}
