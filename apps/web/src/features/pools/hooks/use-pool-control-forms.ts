import type { PoolVoucher, UserPool } from "@clc/api/features/pools/client";
import {
  buildSetPoolFeeCalls,
  buildWithdrawPoolFeesCalls,
  buildWithdrawPoolLiquidityCalls,
  POOL_FEE_PERCENT_DECIMALS,
  swapPoolFeeAddressAbi,
} from "@clc/core/features/pool-admin/logic";
import { BackendApiError } from "@clc/api/client/errors";
import { formatTokenAmount, parseTokenAmount } from "@clc/core/features/wallet/logic";
import { useLingui } from "@lingui/react/macro";
import { useIsMutating } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { getAddress, isAddress, zeroAddress } from "viem";
import { readContract } from "viem/actions";
import { useClient, useConnection } from "wagmi";

import { useAssetOwnerInfo } from "#/features/ownership/hooks/use-asset-owner-info";
import {
  poolAdminRelayMutationKey,
  usePoolAdminRelay,
} from "#/features/pools/hooks/use-pool-admin";
import {
  type PoolFeeSettings,
  usePoolFeeSettings,
} from "#/features/pools/hooks/use-pool-fee-settings";
import { usePoolTreasury } from "#/features/pools/hooks/use-pool-treasury";
import { poolWithdrawalTokens } from "#/features/pools/logic/pool-withdrawal-tokens";
import { useAllAccountTokens } from "#/features/wallet/hooks/use-account-balances";
import { useReverseRecipientResolution } from "#/features/wallet/hooks/use-recipient-resolution";

/**
 * What a steward's control surface reads once: the owner, the vouchers the
 * pool can pay out, their withdrawable balances and the on-chain fee policy.
 * Balances are read for the withdraw forms alone, so an administrator who can only
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
 * Where a withdrawal is paid: the address the steward chose, starting from the
 * signed-in wallet. That holds for a Safe-owned pool too, where the signer
 * proposing the withdrawal is the one taking it unless they name the Safe or
 * someone else.
 *
 * The field's text and the address it resolved to are kept apart: a name or a
 * phone number resolves to an address, and a replaced Sign-in card resolves to
 * nothing even though its address parses. `payable` is the resolved address
 * once it is settled — not zero, not the pool, which would only pay itself, and
 * not a card the reverse lookup reports replaced. Until that lookup answers, a
 * replaced card looks like any other address, so a pending lookup is not payable.
 */
function usePayoutRecipient(poolAddress: `0x${string}`) {
  const { address } = useConnection();
  const [recipient, setRecipient] = useState<string>(address ?? "");
  const [resolved, setResolved] = useState<string | null>(null);
  const trimmed = recipient.trim();
  const typed = isAddress(trimmed) ? getAddress(trimmed) : null;
  const target = resolved && isAddress(resolved) ? getAddress(resolved) : null;
  // The field's own query, so this costs no second request.
  const lookup = useReverseRecipientResolution(target);
  const replaced = lookup.error instanceof BackendApiError && lookup.error.kind === "card-replaced";
  const candidate = target ?? typed;
  const problem = !trimmed
    ? null
    : candidate === null || candidate === zeroAddress
      ? ("invalid" as const)
      : candidate === getAddress(poolAddress)
        ? ("pool" as const)
        : null;
  // A typed address must be the one that resolved: the field reports a new
  // text before it reports what that text resolves to.
  const settled =
    target !== null && (typed === null || typed === target) && !lookup.isPending && !replaced;
  return {
    recipient,
    setRecipient,
    setResolved,
    payable: problem === null && settled ? target : null,
    problem,
  };
}

export type PayoutRecipient = ReturnType<typeof usePayoutRecipient>;

/**
 * Sends pool liquidity to the recipient the steward chose; see
 * `usePayoutRecipient`. `withdrawLiquidity` takes the destination directly.
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
  const relay = usePoolAdminRelay(pool);
  // Any batch for this pool, including one the other view started before a
  // phone/desktop swap: a second press would relay beside it.
  const inFlight = useIsMutating({ mutationKey: poolAdminRelayMutationKey(pool.address) }) > 0;
  const payout = usePayoutRecipient(pool.address);
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
    if (inFlight || !selected || decimals === null || !payout.payable) return;
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
          recipientAddress: payout.payable,
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
    inFlight,
    tokenAddress,
    selectToken: (next: string) => {
      setTokenAddress(next);
      setAmount("");
    },
    amount,
    setAmount,
    selected,
    withdrawable,
    payout,
    canSubmit: !!selected && !!amount.trim() && payout.payable !== null,
    submit,
    amountFor: (voucher: PoolVoucher) => {
      const entry = treasury?.get(voucher.tokenAddress.toLowerCase());
      if (!entry || voucher.decimals === null) return null;
      return `${formatTokenAmount(entry.withdrawableRaw, voucher.decimals, 2)} ${voucher.symbol}`;
    },
  };
}

/**
 * Pays out everything accrued in one voucher to the recipient the steward chose;
 * see `usePayoutRecipient`. `withdraw(token)` only pays the pool's own
 * `feeAddress`, so another recipient is reached through
 * `buildWithdrawPoolFeesCalls`, which restores the fee address it is given.
 * A sealed fee address cannot be moved, so the recipient is pinned to it.
 *
 * The fee address is read from the chain at submit, not taken from the form's
 * cached read: restoring a cached value would undo a recipient change made since,
 * and a stale "the recipient is the fee address" would pay the replacement. Only
 * the owner can change it. A Safe proposal takes the Safe's current nonce and is
 * refused while another waits there, so no Safe transaction lands before it; a
 * directly relayed batch is exposed only to another transaction of the owner's
 * own landing in the seconds between this read and the batch.
 */
export function usePoolCollectFeesForm({
  pool,
  vouchers,
  treasury,
  settings,
  onDone,
}: {
  pool: UserPool;
  vouchers: PoolVoucher[];
  treasury: Map<string, { feesRaw: string }> | undefined;
  /** Read from the pool, not the catalog — see `usePoolFeeSettings`. */
  settings: PoolFeeSettings | undefined;
  onDone: () => void;
}) {
  const { t } = useLingui();
  const client = useClient();
  const relay = usePoolAdminRelay(pool);
  const inFlight = useIsMutating({ mutationKey: poolAdminRelayMutationKey(pool.address) }) > 0;
  const payout = usePayoutRecipient(pool.address);
  const [tokenAddress, setTokenAddress] = useState<string | null>(null);

  const selected = vouchers.find((voucher) => voucher.tokenAddress.toLowerCase() === tokenAddress);
  const accruedRaw = tokenAddress ? treasury?.get(tokenAddress)?.feesRaw : undefined;
  const locked = settings?.feeAddressSealed === true;
  const recipient = locked ? settings.feeAddress : payout.payable;
  const canSubmit = !!selected && !!settings && !!recipient;

  const submit = async () => {
    if (inFlight || !selected || !settings || !recipient) return;
    if (accruedRaw !== undefined && BigInt(accruedRaw) === 0n) {
      toast.error(t`No ${selected.symbol} fees have accrued yet.`);
      return;
    }
    let currentFeeAddress: `0x${string}` | null;
    try {
      if (!client) throw new Error("No chain client.");
      const live = await readContract(client, {
        address: pool.address,
        abi: swapPoolFeeAddressAbi,
        functionName: "feeAddress",
      });
      currentFeeAddress = live === zeroAddress ? null : live;
    } catch {
      toast.error(t`Couldn't read the pool's fee recipient. Try again.`);
      return;
    }
    try {
      await relay.mutateAsync(
        buildWithdrawPoolFeesCalls({
          poolAddress: pool.address,
          tokenAddress: selected.tokenAddress,
          recipientAddress: recipient,
          currentFeeAddress,
        }),
      );
      toast.success(t`${selected.symbol} fees collected.`);
      onDone();
    } catch (error) {
      if (relay.reportError(error, t`The transaction failed.`)) onDone();
    }
  };

  return {
    inFlight,
    tokenAddress,
    selectToken: setTokenAddress,
    selected,
    /** The fee address is sealed: fees can only go to the current recipient. */
    locked,
    payout,
    canSubmit,
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
  const inFlight = useIsMutating({ mutationKey: poolAdminRelayMutationKey(pool.address) }) > 0;
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
    if (inFlight || !canSubmit) return;
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
    inFlight,
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
