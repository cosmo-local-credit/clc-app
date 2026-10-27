import { formatTokenAmountFixed, parseTokenAmount } from "@clc/core/features/wallet/logic";
import {
  chainHasPretiumRamp,
  offrampTokenSymbol,
  pretiumOfframpRecipient,
} from "@clc/core/features/wallet/pretium";
import { useLingui } from "@lingui/react/macro";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { parsePhoneNumber } from "react-phone-number-input";
import { toast } from "sonner";
import { getAddress } from "viem";
import { useConnection } from "wagmi";

import { useAuthProfile } from "#/features/auth/hooks/use-profile";
import {
  accountWalletQueryKeys,
  useAccountTokensInfinite,
} from "#/features/wallet/hooks/use-account-balances";
import {
  pretiumQueryKeys,
  useCreatePretiumLink,
  usePretiumLinkByAddress,
  usePretiumRates,
  usePretiumTransactionsByAddress,
  useTriggerPretiumOnramp,
} from "#/features/wallet/hooks/use-pretium";
import { useSendVoucherTransfer } from "#/features/wallet/hooks/use-send-voucher-transfer";
import {
  cashTimestamp,
  isSafaricomNumber,
  ONRAMP_ASSET,
  sanitizeKes,
} from "#/features/wallet/logic/pretium-cash";
import { useCaliburDelegation } from "#/features/webauthn/hooks/use-calibur-delegation";
import { CHAIN_ID, CHAIN_INFO } from "#/lib/chain";

function toChecksumAddress(address: `0x${string}` | undefined): `0x${string}` | undefined {
  if (!address) return undefined;
  try {
    return getAddress(address);
  } catch {
    return undefined;
  }
}

/** Who may use the MPESA ramps, with which phone, and their Pretium history. */
export function useCashAccess() {
  const { t } = useLingui();
  const { address } = useConnection();
  const profileQuery = useAuthProfile();
  const cashAddress = toChecksumAddress(address);
  const transactionsQuery = usePretiumTransactionsByAddress(cashAddress);
  const cashTransactions = useMemo(
    () =>
      [...(transactionsQuery.data?.onramps ?? []), ...(transactionsQuery.data?.offramps ?? [])]
        .filter((transaction) => transaction.reference)
        .sort((a, b) => cashTimestamp(b.createdAt) - cashTimestamp(a.createdAt)),
    [transactionsQuery.data],
  );

  const phone = profileQuery.data?.phone.trim() ?? "";
  const parsedPhone = phone ? parsePhoneNumber(phone, "KE") : undefined;
  const normalizedCashPhone = parsedPhone?.country === "KE" ? parsedPhone.number : phone;
  const hasPhone = phone.length > 0;
  const hasKenyanPhone = parsedPhone?.country === "KE";
  const disabledReason = !chainHasPretiumRamp(CHAIN_ID)
    ? t`Cash services aren't available on ${CHAIN_INFO.name}.`
    : !cashAddress
      ? t`Connect your wallet to use MPESA.`
      : profileQuery.isPending
        ? t`Loading your profile…`
        : profileQuery.isError
          ? t`We couldn't load your profile phone number.`
          : !hasPhone
            ? t`Add a phone number to your profile to use MPESA.`
            : !hasKenyanPhone
              ? t`MPESA cash services need a Kenyan phone number.`
              : null;

  return {
    cashAddress,
    cashTransactions,
    transactionsQuery,
    profilePending: profileQuery.isPending,
    phone: normalizedCashPhone,
    hasKenyanPhone,
    disabledReason,
    entryDisabled: !!disabledReason,
  };
}

/**
 * The Add stables (onramp) form: a KES amount, the approximate USD₮ it buys,
 * and the MPESA prompt. `submit` resolves true once the prompt is sent.
 */
export function useAddStables({
  access,
  ratesEnabled,
}: {
  access: ReturnType<typeof useCashAccess>;
  ratesEnabled: boolean;
}) {
  const { t } = useLingui();
  const { cashAddress: address, phone, disabledReason, hasKenyanPhone } = access;
  const [amount, setAmount] = useState("");
  const ratesQuery = usePretiumRates(ratesEnabled);
  const triggerOnramp = useTriggerPretiumOnramp();
  const mutationError = triggerOnramp.error instanceof Error ? triggerOnramp.error.message : null;

  const amountValue = Number(amount);
  const hasValidAmount =
    amount.trim() !== "" &&
    Number.isFinite(amountValue) &&
    amountValue >= 100 &&
    amountValue <= 250_000;
  const canContinue = !!address && hasKenyanPhone && hasValidAmount;

  // Soft, non-blocking check: only warn once the number clears the hard gates
  // (present + Kenyan). A ported Safaricom line can still work, so we never
  // disable Continue on this alone.
  const showSafaricomWarning = !disabledReason && phone.length > 0 && !isSafaricomNumber(phone);

  // Approximate USD₮ received = KES amount ÷ Pretium sell rate. Shown in place
  // of the raw buy/sell rate; null while rates load, on error, or bad amount.
  const sellRate = Number(ratesQuery.data?.sell);
  const approxUsdt =
    ratesQuery.isSuccess && Number.isFinite(sellRate) && sellRate > 0 && hasValidAmount
      ? amountValue / sellRate
      : null;

  const submit = async (): Promise<boolean> => {
    if (!address || !canContinue) return false;
    try {
      // Pretium's onramp treats the phone as an MPESA shortcode and requires a
      // 10-digit local number (0-prefixed). Profiles store E.164 (+254…), so
      // convert for this call only.
      const parsed = parsePhoneNumber(phone, "KE");
      const shortcode = parsed ? `0${parsed.nationalNumber}` : phone;
      const result = await triggerOnramp.mutateAsync({
        address,
        phoneNumber: shortcode,
        asset: ONRAMP_ASSET,
        amount: amountValue,
      });
      toast.success(t`MPESA prompt sent`, {
        description: result.message || t`Complete the prompt on your phone.`,
      });
      return true;
    } catch {
      toast.error(t`Couldn't start MPESA top up`);
      return false;
    }
  };

  return {
    amount,
    setAmount: (value: string) => setAmount(value.replace(/[^0-9.]/g, "")),
    hasValidAmount,
    canContinue,
    showSafaricomWarning,
    approxUsdt,
    ratesPending: ratesQuery.isPending,
    mutationError,
    pending: triggerOnramp.isPending,
    submit,
  };
}

/**
 * The Withdraw (offramp) form: the MPESA link check, the eligible stables, a
 * whole-KES amount and the transfer to Pretium. Transient state resets when
 * `open` turns false. `submit` resolves true once the transfer is relayed.
 */
export function usePretiumWithdraw({
  open,
  address,
  phone,
  entryDisabled,
}: {
  open: boolean;
  address: `0x${string}` | undefined;
  phone: string;
  entryDisabled: boolean;
}) {
  const { t } = useLingui();
  const queryClient = useQueryClient();

  // Undefined on a chain with no offramp wired up, which also leaves `eligible`
  // empty — there is then nothing to select and nothing to send.
  const offrampRecipient = pretiumOfframpRecipient(CHAIN_ID);

  const ratesQuery = usePretiumRates(open);
  const buyRate = Number(ratesQuery.data?.buy);
  const hasRate = ratesQuery.isSuccess && Number.isFinite(buyRate) && buyRate > 0;

  // Always re-check the address→phone link when the form opens; if it is
  // missing or points at a stale number, (re)link to the current profile phone.
  const linkEnabled = open && !entryDisabled;
  const linkQuery = usePretiumLinkByAddress(address, linkEnabled);
  const createLink = useCreatePretiumLink();
  const correctlyLinked = linkQuery.data?.linked === true && linkQuery.data.phoneNumber === phone;

  const tokensQuery = useAccountTokensInfinite(address, { perPage: 100 });
  const eligible = useMemo(() => {
    const all = tokensQuery.data?.pages.flatMap((page) => page.tokens) ?? [];
    return all.flatMap((token) => {
      const symbol = offrampTokenSymbol(CHAIN_ID, token.tokenAddress);
      if (!symbol || BigInt(token.balance) <= 0n) return [];
      return [{ token, symbol }];
    });
  }, [tokensQuery.data]);

  const delegation = useCaliburDelegation(address);
  const sendTransfer = useSendVoucherTransfer();
  const sendError = sendTransfer.error instanceof Error ? sendTransfer.error.message : null;

  const [selectedAddress, setSelectedAddress] = useState<string | undefined>(undefined);
  const [amount, setAmount] = useState("");

  const selected =
    eligible.find((item) => item.token.tokenAddress === selectedAddress) ?? eligible[0];
  const decimals = selected?.token.tokenDecimals ?? 2;
  const balanceRaw = selected?.token.balance ?? "0";
  const balanceUsd = selected ? Number(formatTokenAmountFixed(balanceRaw, decimals, 6)) : 0;
  const maxKes = hasRate ? Math.floor(balanceUsd * buyRate) : 0;

  const kesValue = Number(amount);
  const hasValidAmount =
    amount.trim() !== "" &&
    Number.isFinite(kesValue) &&
    kesValue > 0 &&
    hasRate &&
    kesValue <= maxKes + 1e-9;
  const tokenToSend = hasValidAmount ? kesValue / buyRate : 0;

  const linkReady = createLink.isSuccess || (!linkQuery.isFetching && correctlyLinked);
  const linkPreparing =
    linkQuery.isPending || (linkQuery.isFetching && !createLink.isSuccess) || createLink.isPending;
  const linkFailed = linkQuery.isError || createLink.isError;
  const canWithdraw =
    linkReady && !!selected && hasValidAmount && delegation !== "checking" && !!address;

  // Reset transient state whenever the form closes.
  useEffect(() => {
    if (open) return;
    createLink.reset();
    setSelectedAddress(undefined);
    setAmount("");
  }, [open]);

  // Auto re-link once the status check resolves and the address is not already
  // correctly linked to the current phone.
  useEffect(() => {
    if (!linkEnabled || !address || !phone) return;
    if (!linkQuery.isSuccess || linkQuery.isFetching || correctlyLinked) return;
    if (createLink.isIdle) {
      createLink.mutate({ publicKey: address, phoneNumber: phone });
    }
  }, [
    linkEnabled,
    address,
    phone,
    linkQuery.isSuccess,
    linkQuery.isFetching,
    correctlyLinked,
    createLink.isIdle,
  ]);

  const selectToken = (tokenAddress: string) => {
    setSelectedAddress(tokenAddress);
    setAmount("");
  };

  const submit = async (): Promise<boolean> => {
    if (!address || !selected || !hasValidAmount || !offrampRecipient) return false;
    // Reverse the whole-shilling KES amount through the buy rate. MAX also uses
    // the trimmed whole KES value, so the displayed KES amount and signed token
    // amount stay consistent.
    const tokenAmount = (kesValue / buyRate).toFixed(Math.min(decimals, 6));
    let amountRaw = parseTokenAmount(tokenAmount, decimals);
    if (BigInt(amountRaw) > BigInt(balanceRaw)) amountRaw = balanceRaw;

    try {
      await sendTransfer.mutateAsync({
        senderAddress: address,
        tokenAddress: selected.token.tokenAddress as `0x${string}`,
        recipientAddress: offrampRecipient,
        amountRaw,
        includeAuthorization: delegation === "not-delegated",
      });
      toast.success(t`Withdrawal submitted`, {
        description: t`Your MPESA payout will arrive shortly.`,
      });
      void queryClient.invalidateQueries({
        queryKey: pretiumQueryKeys.transactionsByAddress(address),
      });
      void queryClient.invalidateQueries({ queryKey: accountWalletQueryKeys.all });
      return true;
    } catch {
      toast.error(t`Couldn't submit withdrawal`);
      return false;
    }
  };

  const retryLink = () => {
    if (linkQuery.isError) {
      void linkQuery.refetch();
      return;
    }
    createLink.reset();
  };

  return {
    eligible,
    selected,
    selectToken,
    amount,
    setAmount: (value: string) => setAmount(sanitizeKes(value)),
    setMax: () => setAmount(maxKes.toString()),
    canSetMax: hasRate && maxKes > 0,
    hasValidAmount,
    tokenToSend,
    tokensPending: tokensQuery.isPending,
    linkReady,
    linkPreparing,
    linkFailed,
    linkRetrying: linkQuery.isFetching,
    retryLink,
    canWithdraw,
    sendError,
    pending: sendTransfer.isPending,
    submit,
  };
}
