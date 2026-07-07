import { Trans, useLingui } from "@lingui/react/macro";
import { useMemo, useState } from "react";
import { parsePhoneNumber } from "react-phone-number-input";
import { RiArrowRightSLine, RiErrorWarningLine, RiHistoryLine } from "react-icons/ri";
import { toast } from "sonner";
import { getAddress } from "viem";
import { useAccount } from "wagmi";

import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import {
  SheetBackdrop,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetPortal,
  SheetRoot,
  SheetTitle,
} from "#/components/ui/sheet";
import { BackChevron } from "#/components/wallet/wallet-kit";
import { useAuthProfile } from "#/features/auth/hooks/use-profile";
import type { PretiumCashTransaction } from "#/features/wallet/api/pretium-client";
import {
  usePretiumTransactionsByAddress,
  useTriggerPretiumOnramp,
  usePretiumRates,
} from "#/features/wallet/hooks/use-pretium";
import { cn } from "#/lib/utils";

const PRETIUM_ONRAMP_ASSET = "cUSD" as const;

export function TopUpPage() {
  const { t } = useLingui();
  const { address } = useAccount();
  const profileQuery = useAuthProfile();
  const [amount, setAmount] = useState("20");
  const [addStablesOpen, setAddStablesOpen] = useState(false);

  const cashAddress = toChecksumAddress(address);
  const transactionsQuery = usePretiumTransactionsByAddress(cashAddress);
  const cashTransactions = useMemo(
    () =>
      [...(transactionsQuery.data?.onramps ?? []), ...(transactionsQuery.data?.offramps ?? [])]
        .filter((transaction) => transaction.reference)
        .sort((a, b) => timestamp(b.createdAt) - timestamp(a.createdAt)),
    [transactionsQuery.data],
  );

  const phone = profileQuery.data?.phone.trim() ?? "";
  const parsedPhone = phone ? parsePhoneNumber(phone) : undefined;
  const hasPhone = phone.length > 0;
  const hasKenyanPhone = parsedPhone?.country === "KE";
  const disabledReason = !cashAddress
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
  const amountValue = Number(amount);
  const hasValidAmount =
    amount.trim() !== "" &&
    Number.isFinite(amountValue) &&
    amountValue >= 20 &&
    amountValue <= 250_000;
  const entryDisabled = !!disabledReason;
  const canContinue = !!cashAddress && hasKenyanPhone && hasValidAmount;

  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <BackChevron label={t`Cash`} to="/" />

      <div className="mb-6 space-y-1">
        <h1 className="font-heading text-[1.75rem] font-bold leading-tight">
          <Trans>Cash</Trans>
        </h1>
        <p className="text-muted-foreground text-sm">
          <Trans>Buy or sell stables with local money.</Trans>
        </p>
      </div>

      <div className="space-y-5">
        <section aria-labelledby="add-stables-title" className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <h2 id="add-stables-title" className="font-heading font-semibold text-base">
              <Trans>Add stables</Trans>
            </h2>
            <span className="text-muted-foreground text-xs">MPESA</span>
          </div>

          <button
            type="button"
            onClick={() => setAddStablesOpen(true)}
            className="flex w-full items-center gap-3 border border-border bg-card p-4 text-left active:bg-muted"
          >
            <PretiumLogo />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm">
                <Trans>MPESA via Pretium</Trans>
              </p>
              <p className="text-muted-foreground text-xs">
                <Trans>Buy {PRETIUM_ONRAMP_ASSET} with KES.</Trans>
              </p>
            </div>
            <RiArrowRightSLine
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          </button>
        </section>

        <section aria-labelledby="withdraw-title" className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <h2 id="withdraw-title" className="font-heading font-semibold text-base">
              <Trans>Withdraw</Trans>
            </h2>
            <span className="border border-border px-1.5 py-0.5 text-[0.5625rem] font-semibold tracking-[0.06em] uppercase text-muted-foreground">
              <Trans>Soon</Trans>
            </span>
          </div>

          <button
            type="button"
            disabled
            className="flex w-full items-center gap-3 border border-border bg-card p-4 text-left opacity-60"
          >
            <PretiumLogo />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm">
                <Trans>MPESA via Pretium</Trans>
              </p>
              <p className="text-muted-foreground text-xs">
                <Trans>Sell stables to local money.</Trans>
              </p>
            </div>
            <RiArrowRightSLine
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          </button>
        </section>

        <PretiumHistory
          transactions={cashTransactions}
          isPending={!!cashAddress && transactionsQuery.isPending}
          isError={!!cashAddress && transactionsQuery.isError}
          onRetry={() => {
            void transactionsQuery.refetch();
          }}
        />
      </div>

      <AddStablesSheet
        open={addStablesOpen}
        onOpenChange={setAddStablesOpen}
        amount={amount}
        amountValue={amountValue}
        onAmountChange={setAmount}
        address={cashAddress}
        phone={phone}
        profilePending={profileQuery.isPending}
        disabledReason={disabledReason}
        entryDisabled={entryDisabled}
        hasValidAmount={hasValidAmount}
        canContinue={canContinue}
      />
    </div>
  );
}

function AddStablesSheet({
  open,
  onOpenChange,
  amount,
  amountValue,
  onAmountChange,
  address,
  phone,
  profilePending,
  disabledReason,
  entryDisabled,
  hasValidAmount,
  canContinue,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amount: string;
  amountValue: number;
  onAmountChange: (amount: string) => void;
  address: `0x${string}` | undefined;
  phone: string;
  profilePending: boolean;
  disabledReason: string | null;
  entryDisabled: boolean;
  hasValidAmount: boolean;
  canContinue: boolean;
}) {
  const { t } = useLingui();
  const ratesQuery = usePretiumRates(open);
  const triggerOnramp = useTriggerPretiumOnramp();
  const mutationError = triggerOnramp.error instanceof Error ? triggerOnramp.error.message : null;

  const onContinue = async () => {
    if (!address || !canContinue) return;

    try {
      const result = await triggerOnramp.mutateAsync({
        address,
        phoneNumber: phone,
        asset: PRETIUM_ONRAMP_ASSET,
        amount: amountValue,
      });

      toast.success(t`MPESA prompt sent`, {
        description: result.message || t`Complete the prompt on your phone.`,
      });
      onOpenChange(false);
    } catch {
      toast.error(t`Couldn't start MPESA top up`);
    }
  };

  return (
    <SheetRoot open={open} onOpenChange={onOpenChange}>
      <SheetPortal>
        <SheetBackdrop />
        <SheetContent className="rounded-none border-t border-border bg-background shadow-none [&>div:first-child]:hidden">
          <SheetHeader className="px-6 pt-5 pb-3">
            <div className="flex items-center gap-3">
              <PretiumLogo />
              <div>
                <SheetTitle className="font-heading text-[1.375rem] font-semibold tracking-tight">
                  <Trans>Add stables</Trans>
                </SheetTitle>
                <p className="text-muted-foreground text-xs">
                  <Trans>MPESA via Pretium</Trans>
                </p>
              </div>
            </div>
          </SheetHeader>

          <div className="space-y-4 px-6 pb-3">
            <div className="space-y-1.5">
              <label htmlFor="topup-phone" className="font-medium text-sm">
                <Trans>MPESA phone</Trans>
              </label>
              <Input
                id="topup-phone"
                type="tel"
                value={profilePending ? "" : phone}
                placeholder={t`No phone number`}
                readOnly
                disabled={entryDisabled}
                aria-invalid={!!disabledReason && !profilePending}
                className="font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="topup-amount" className="font-medium text-sm">
                <Trans>Amount</Trans>
              </label>
              <div
                className={cn(
                  "flex h-11 items-center border border-input bg-card px-3 transition-[color,border-color] focus-within:border-foreground",
                  entryDisabled && "opacity-50",
                  !hasValidAmount && "border-destructive",
                )}
              >
                <span className="mr-2 shrink-0 text-muted-foreground text-sm font-semibold">
                  KES
                </span>
                <Input
                  id="topup-amount"
                  type="text"
                  inputMode="decimal"
                  min={20}
                  max={250_000}
                  value={amount}
                  onChange={(event) => onAmountChange(event.target.value.replace(/[^0-9.]/g, ""))}
                  placeholder="20"
                  disabled={entryDisabled}
                  aria-invalid={!hasValidAmount}
                  className="h-auto min-h-0 border-0 bg-transparent px-0 py-0 font-heading text-xl font-semibold tracking-tight focus-visible:border-0"
                />
              </div>
            </div>

            <div className="border border-border bg-card p-3 text-xs">
              {ratesQuery.isPending ? (
                <p className="text-muted-foreground">
                  <Trans>Loading Pretium rates…</Trans>
                </p>
              ) : ratesQuery.isError ? (
                <p className="text-muted-foreground">
                  <Trans>Rates unavailable. They will be shown before you confirm.</Trans>
                </p>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">
                    <Trans>Pretium rate</Trans>
                  </span>
                  <span className="font-mono font-semibold">
                    <Trans>
                      Buy {ratesQuery.data.buy} · Sell {ratesQuery.data.sell}
                    </Trans>
                  </span>
                </div>
              )}
            </div>

            {disabledReason ? (
              <div className="flex gap-2 border border-border bg-card p-3 text-muted-foreground text-xs">
                <RiErrorWarningLine className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <p>{disabledReason}</p>
              </div>
            ) : null}

            {mutationError ? (
              <div className="flex gap-2 border border-destructive/30 bg-card p-3 text-destructive text-xs">
                <RiErrorWarningLine className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <p>{mutationError}</p>
              </div>
            ) : null}
          </div>

          <SheetFooter className="px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <Button
              className="h-11 w-full"
              disabled={!canContinue || triggerOnramp.isPending}
              onClick={() => void onContinue()}
            >
              {triggerOnramp.isPending ? <Trans>Starting…</Trans> : <Trans>Continue</Trans>}
            </Button>
          </SheetFooter>
        </SheetContent>
      </SheetPortal>
    </SheetRoot>
  );
}

function PretiumHistory({
  transactions,
  isPending,
  isError,
  onRetry,
}: {
  transactions: PretiumCashTransaction[];
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  return (
    <section aria-labelledby="pretium-history-title" className="space-y-2">
      <h2 id="pretium-history-title" className="font-heading font-semibold text-base">
        <Trans>Pretium history</Trans>
      </h2>
      <div className="border border-border bg-card">
        {isPending ? (
          <div className="p-4 text-muted-foreground text-sm">
            <Trans>Loading cash activity…</Trans>
          </div>
        ) : null}
        {isError ? (
          <div className="space-y-2 p-4">
            <p className="text-muted-foreground text-sm">
              <Trans>Couldn't load Pretium history.</Trans>
            </p>
            <Button variant="outline" size="sm" className="h-9 bg-card" onClick={onRetry}>
              <Trans>Try again</Trans>
            </Button>
          </div>
        ) : null}
        {!isPending && !isError && transactions.length === 0 ? (
          <div className="flex gap-3 p-4 text-muted-foreground">
            <RiHistoryLine className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div className="space-y-1">
              <p className="font-medium text-foreground text-sm">
                <Trans>No cash activity yet.</Trans>
              </p>
              <p className="text-xs">
                <Trans>Pretium deposits and withdrawals will appear here.</Trans>
              </p>
            </div>
          </div>
        ) : null}
        {transactions.slice(0, 4).map((transaction, index, list) => (
          <div
            key={`${transaction.kind}-${transaction.reference}`}
            className={cn(
              "flex items-center gap-3 p-3",
              index < list.length - 1 && "border-b border-border",
            )}
          >
            <span className="flex size-8 shrink-0 items-center justify-center border border-border bg-background text-[0.625rem] font-semibold uppercase">
              {transaction.kind === "onramp" ? <Trans>In</Trans> : <Trans>Out</Trans>}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm">
                {transaction.kind === "onramp" ? (
                  <Trans>Add stables</Trans>
                ) : (
                  <Trans>Withdraw</Trans>
                )}
              </p>
              <p className="truncate text-muted-foreground text-xs">
                {transaction.reference} · {formatCashDate(transaction.createdAt)}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-heading text-sm font-semibold tracking-tight">
                KES {transaction.amountKes || "—"}
              </p>
              <p className="text-muted-foreground text-[0.625rem] uppercase">
                {transaction.status}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PretiumLogo() {
  return (
    <img
      src="/pretium.png"
      alt=""
      className="size-11 shrink-0 border border-border bg-card object-contain"
      aria-hidden="true"
    />
  );
}

function toChecksumAddress(address: `0x${string}` | undefined): `0x${string}` | undefined {
  if (!address) return undefined;
  try {
    return getAddress(address);
  } catch {
    return undefined;
  }
}

function timestamp(date: string): number {
  const value = Date.parse(date);
  return Number.isFinite(value) ? value : 0;
}

function formatCashDate(date: string): string {
  if (!date) return "—";
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return "—";
  return value.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
