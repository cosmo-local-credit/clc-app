import { Trans, useLingui } from "@lingui/react/macro";
import { useMemo, useState } from "react";
import { parsePhoneNumber } from "react-phone-number-input";
import { RiArrowRightSLine, RiErrorWarningLine, RiHistoryLine } from "react-icons/ri";
import { toast } from "sonner";
import { getAddress } from "viem";
import { useAccount } from "wagmi";

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
import { BackChevron } from "#/components/wallet/wallet-kit";
import { useAuthProfile } from "#/features/auth/hooks/use-profile";
import type { PretiumCashTransaction } from "#/features/wallet/api/pretium-client";
import {
  usePretiumTransactionsByAddress,
  useTriggerPretiumOnramp,
  usePretiumRates,
} from "#/features/wallet/hooks/use-pretium";
import { cn } from "#/lib/utils";

// We only onramp Tether. `ONRAMP_ASSET` is the Pretium asset code sent to the
// backend; `ONRAMP_ASSET_LABEL` is the branded display form (USD₮).
const ONRAMP_ASSET = "USDT" as const;
const ONRAMP_ASSET_LABEL = "USD₮";

// Safaricom MSISDN ranges (0/+254/254 prefix). A non-match is a soft signal
// only: the line may be a ported Safaricom number, so we warn without blocking
// the top-up. MPESA only settles to Safaricom lines.
const SAFARICOM_REGEX = /^(?:0|\+?254)(?:11[0-5]|7(?:[0129][0-9]|4[0-3568]|5[7-9]|6[89]))[0-9]{6}$/;

function isSafaricomNumber(phone: string): boolean {
  return SAFARICOM_REGEX.test(phone.replace(/\s+/g, ""));
}

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
                <Trans>Buy USD₮ with KES.</Trans>
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

  const onContinue = async () => {
    if (!address || !canContinue) return;

    try {
      // Pretium's onramp treats the phone as an MPESA shortcode and requires a
      // 10-digit local number (0-prefixed). Profiles store E.164 (+254…), so
      // convert for this call only.
      const parsed = parsePhoneNumber(phone);
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

          <div className="space-y-3 px-6 pb-3">
            <div className="border border-border bg-card">
              <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-3 py-2.5">
                <label htmlFor="topup-amount" className="text-muted-foreground text-xs">
                  <Trans>Amount</Trans>
                </label>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-muted-foreground text-xs">KES</span>
                  <input
                    id="topup-amount"
                    type="text"
                    inputMode="decimal"
                    autoFocus
                    value={amount}
                    onChange={(event) => onAmountChange(event.target.value.replace(/[^0-9.]/g, ""))}
                    placeholder="20"
                    size={Math.max(amount.length, 2)}
                    disabled={entryDisabled}
                    aria-invalid={!hasValidAmount}
                    className={cn(
                      "bg-transparent text-right font-mono text-sm font-semibold caret-primary outline-none [field-sizing:content]",
                      !hasValidAmount && "text-destructive",
                      entryDisabled && "opacity-50",
                    )}
                  />
                </div>
              </div>

              <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-3 py-2.5">
                <span className="text-muted-foreground text-xs">
                  <Trans>MPESA phone</Trans>
                </span>
                <span className="font-mono text-xs font-semibold">
                  {profilePending ? "…" : phone || "—"}
                </span>
              </div>

              <div className="flex min-h-11 items-center justify-between gap-3 px-3 py-2.5">
                <span className="text-muted-foreground text-xs">
                  <Trans>You'll receive</Trans>
                </span>
                <span className="font-mono text-xs font-semibold">
                  {ratesQuery.isPending ? (
                    <span className="text-muted-foreground">…</span>
                  ) : approxUsdt !== null ? (
                    `≈ ${approxUsdt.toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })} ${ONRAMP_ASSET_LABEL}`
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </span>
              </div>
            </div>

            {showSafaricomWarning ? (
              <p
                className="flex items-start gap-2 text-amber-700 text-xs dark:text-amber-500"
                role="alert"
              >
                <RiErrorWarningLine className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <Trans>Not a standard Safaricom number. Continue only if it's ported.</Trans>
              </p>
            ) : null}

            {disabledReason ? (
              <p className="flex items-start gap-2 text-muted-foreground text-xs">
                <RiErrorWarningLine className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {disabledReason}
              </p>
            ) : null}

            {mutationError ? (
              <p className="flex items-start gap-2 text-destructive text-xs" role="alert">
                <RiErrorWarningLine className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {mutationError}
              </p>
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
