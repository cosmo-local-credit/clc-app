import {
  formatTokenAmount,
  formatTokenAmountFixed,
  parseTokenAmount,
} from "@clc/core/features/wallet/logic";
import { offrampTokenSymbol, PRETIUM_OFFRAMP_RECIPIENT } from "@clc/core/features/wallet/pretium";
import { Trans, useLingui } from "@lingui/react/macro";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { RiCheckLine, RiErrorWarningLine } from "react-icons/ri";
import { toast } from "sonner";

import { Button } from "#/components/ui/button";
import {
  SheetBackdrop,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetPortal,
  SheetRoot,
  SheetTitle,
} from "#/components/ui/sheet";
import {
  accountWalletQueryKeys,
  useAccountTokensInfinite,
} from "#/features/wallet/hooks/use-account-balances";
import {
  pretiumQueryKeys,
  useCreatePretiumLink,
  usePretiumLinkByAddress,
  usePretiumRates,
} from "#/features/wallet/hooks/use-pretium";
import { useSendVoucherTransfer } from "#/features/wallet/hooks/use-send-voucher-transfer";
import { useCaliburDelegation } from "#/features/webauthn/hooks/use-calibur-delegation";
import { cn } from "#/lib/utils";

/** Keep only digits and a single decimal point, capped at 2 fraction digits. */
function sanitizeKes(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  const firstDot = cleaned.indexOf(".");
  if (firstDot === -1) return cleaned;
  const whole = cleaned.slice(0, firstDot);
  const fraction = cleaned
    .slice(firstDot + 1)
    .replace(/\./g, "")
    .slice(0, 2);
  return `${whole}.${fraction}`;
}

export function WithdrawSheet({
  open,
  onOpenChange,
  address,
  phone,
  disabledReason,
  entryDisabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  address: `0x${string}` | undefined;
  phone: string;
  disabledReason: string | null;
  entryDisabled: boolean;
}) {
  const { t } = useLingui();
  const queryClient = useQueryClient();

  const ratesQuery = usePretiumRates(open);
  const buyRate = Number(ratesQuery.data?.buy);
  const hasRate = ratesQuery.isSuccess && Number.isFinite(buyRate) && buyRate > 0;

  // Always re-check the address→phone link when the sheet opens; if it is
  // missing or points at a stale number, (re)link to the current profile phone.
  const linkEnabled = open && !entryDisabled;
  const linkQuery = usePretiumLinkByAddress(address, linkEnabled);
  const createLink = useCreatePretiumLink();
  const correctlyLinked = linkQuery.data?.linked === true && linkQuery.data.phoneNumber === phone;

  const tokensQuery = useAccountTokensInfinite(address, 100);
  const eligible = useMemo(() => {
    const all = tokensQuery.data?.pages.flatMap((page) => page.tokens) ?? [];
    return all.flatMap((token) => {
      const symbol = offrampTokenSymbol(token.tokenAddress);
      if (!symbol || BigInt(token.balance) <= 0n) return [];
      return [{ token, symbol }];
    });
  }, [tokensQuery.data]);

  const delegation = useCaliburDelegation(address);
  const sendTransfer = useSendVoucherTransfer();
  const sendError = sendTransfer.error instanceof Error ? sendTransfer.error.message : null;

  const [selectedAddress, setSelectedAddress] = useState<string | undefined>(undefined);
  const [amount, setAmount] = useState("");
  const [maxSelected, setMaxSelected] = useState(false);
  const [amountFocused, setAmountFocused] = useState(false);

  const selected =
    eligible.find((item) => item.token.tokenAddress === selectedAddress) ?? eligible[0];
  const decimals = selected?.token.tokenDecimals ?? 2;
  const balanceRaw = selected?.token.balance ?? "0";
  const balanceUsd = selected ? Number(formatTokenAmountFixed(balanceRaw, decimals, 6)) : 0;
  const maxKes = hasRate ? balanceUsd * buyRate : 0;

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

  // Reset transient state whenever the sheet closes.
  useEffect(() => {
    if (open) return;
    createLink.reset();
    setSelectedAddress(undefined);
    setAmount("");
    setMaxSelected(false);
  }, [open, createLink]);

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
    createLink,
  ]);

  const onSelectToken = (tokenAddress: string) => {
    setSelectedAddress(tokenAddress);
    setAmount("");
    setMaxSelected(false);
  };

  const onWithdraw = async () => {
    if (!address || !selected || !hasValidAmount) return;
    // MAX sends the exact balance to avoid dust; otherwise reverse the KES
    // amount through the buy rate and clamp to the balance.
    let amountRaw = balanceRaw;
    if (!maxSelected) {
      const tokenAmount = (kesValue / buyRate).toFixed(Math.min(decimals, 6));
      amountRaw = parseTokenAmount(tokenAmount, decimals);
      if (BigInt(amountRaw) > BigInt(balanceRaw)) amountRaw = balanceRaw;
    }

    try {
      await sendTransfer.mutateAsync({
        senderAddress: address,
        tokenAddress: selected.token.tokenAddress as `0x${string}`,
        recipientAddress: PRETIUM_OFFRAMP_RECIPIENT as `0x${string}`,
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
      onOpenChange(false);
    } catch {
      toast.error(t`Couldn't submit withdrawal`);
    }
  };

  const onRetryLink = () => {
    if (linkQuery.isError) {
      void linkQuery.refetch();
      return;
    }
    createLink.reset();
  };

  return (
    <SheetRoot open={open} onOpenChange={onOpenChange}>
      <SheetPortal>
        <SheetBackdrop />
        <SheetContent className="rounded-none border-t border-border bg-background shadow-none [&>div:first-child]:hidden">
          <SheetHeader className="px-6 pt-5 pb-3">
            <SheetTitle className="font-heading text-[1.375rem] font-semibold tracking-tight">
              <Trans>Withdraw</Trans>
            </SheetTitle>
            <p className="text-muted-foreground text-xs">
              <Trans>MPESA via Pretium</Trans>
            </p>
          </SheetHeader>

          <div className="space-y-3 px-6 pb-3">
            {entryDisabled ? (
              <p className="flex items-start gap-2 text-muted-foreground text-xs">
                <RiErrorWarningLine className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {disabledReason}
              </p>
            ) : linkFailed ? (
              <div className="space-y-2">
                <p className="flex items-start gap-2 text-destructive text-xs" role="alert">
                  <RiErrorWarningLine className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <Trans>Couldn't verify your MPESA link.</Trans>
                </p>
                <Button variant="outline" size="sm" className="h-9 bg-card" onClick={onRetryLink}>
                  <Trans>Try again</Trans>
                </Button>
              </div>
            ) : !linkReady || linkPreparing ? (
              <p className="text-muted-foreground text-sm">
                <Trans>Preparing your withdrawal…</Trans>
              </p>
            ) : tokensQuery.isPending ? (
              <p className="text-muted-foreground text-sm">
                <Trans>Loading balances…</Trans>
              </p>
            ) : eligible.length === 0 ? (
              <p className="flex items-start gap-2 text-muted-foreground text-xs">
                <RiErrorWarningLine className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <Trans>No USDm, USDT, or USDC balance available to withdraw.</Trans>
              </p>
            ) : (
              <>
                <div className="border border-border bg-card">
                  {eligible.map(({ token, symbol }, index, list) => {
                    const active = token.tokenAddress === selected?.token.tokenAddress;
                    const tokenBalance = formatTokenAmount(token.balance, token.tokenDecimals);
                    return (
                      <button
                        key={token.tokenAddress}
                        type="button"
                        onClick={() => onSelectToken(token.tokenAddress)}
                        className={cn(
                          "flex w-full items-center gap-3 px-3 py-2.5 text-left enabled:active:bg-muted",
                          index < list.length - 1 && "border-b border-border",
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-sm">{symbol}</p>
                          <p className="text-muted-foreground text-xs">
                            <Trans>Balance {tokenBalance}</Trans>
                          </p>
                        </div>
                        {active ? (
                          <RiCheckLine
                            className="size-4 shrink-0 text-primary"
                            aria-hidden="true"
                          />
                        ) : null}
                      </button>
                    );
                  })}
                </div>

                <div className="border border-border bg-card">
                  <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-3 py-2.5">
                    <label htmlFor="withdraw-amount" className="text-muted-foreground text-xs">
                      <Trans>Amount</Trans>
                    </label>
                    <div className="relative flex items-baseline gap-1.5">
                      <input
                        id="withdraw-amount"
                        type="text"
                        inputMode="decimal"
                        value={amount}
                        onFocus={() => setAmountFocused(true)}
                        onBlur={() => setAmountFocused(false)}
                        onChange={(event) => {
                          setMaxSelected(false);
                          setAmount(sanitizeKes(event.target.value));
                        }}
                        placeholder="0"
                        size={Math.max(amount.length, 2)}
                        aria-invalid={amount !== "" && !hasValidAmount}
                        className={cn(
                          "bg-transparent text-right font-mono text-sm font-semibold caret-primary outline-none placeholder:text-muted-foreground [field-sizing:content]",
                          amount !== "" && !hasValidAmount && "text-destructive",
                        )}
                      />
                      {!amount && !amountFocused ? (
                        <span
                          aria-hidden="true"
                          className="pointer-events-none h-4 w-px animate-pulse bg-primary"
                        />
                      ) : null}
                      <span className="text-muted-foreground text-xs">KES</span>
                      <button
                        type="button"
                        onClick={() => {
                          setAmount(maxKes.toFixed(2));
                          setMaxSelected(true);
                        }}
                        className="ml-1 font-semibold text-primary text-xs hover:underline"
                      >
                        <Trans>Max</Trans>
                      </button>
                    </div>
                  </div>

                  <div className="flex min-h-11 items-center justify-between gap-3 px-3 py-2.5">
                    <span className="text-muted-foreground text-xs">
                      <Trans>You'll send</Trans>
                    </span>
                    <span className="font-mono text-xs font-semibold">
                      {selected && hasValidAmount
                        ? `≈ ${tokenToSend.toLocaleString(undefined, {
                            maximumFractionDigits: 4,
                          })} ${selected.symbol}`
                        : "—"}
                    </span>
                  </div>
                </div>
              </>
            )}

            {sendError ? (
              <p className="flex items-start gap-2 text-destructive text-xs" role="alert">
                <RiErrorWarningLine className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {sendError}
              </p>
            ) : null}
          </div>

          <SheetFooter className="px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <Button
              className="h-11 w-full"
              disabled={!canWithdraw || sendTransfer.isPending}
              onClick={() => void onWithdraw()}
            >
              {sendTransfer.isPending ? <Trans>Submitting…</Trans> : <Trans>Withdraw</Trans>}
            </Button>
          </SheetFooter>
        </SheetContent>
      </SheetPortal>
    </SheetRoot>
  );
}
