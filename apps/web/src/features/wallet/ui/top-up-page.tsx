import { Trans, useLingui } from "@lingui/react/macro";
import { useMemo, useState } from "react";
import { parsePhoneNumber } from "react-phone-number-input";
import {
  RiArrowRightSLine,
  RiCheckLine,
  RiErrorWarningLine,
  RiFileCopyLine,
  RiHistoryLine,
  RiTimeLine,
} from "react-icons/ri";
import { toast } from "sonner";
import { getAddress } from "viem";
import { useConnection } from "wagmi";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { SectionHeading } from "#/components/ui/section-heading";
import {
  SheetBackdrop,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetPortal,
  SheetRoot,
  SheetTitle,
} from "#/components/ui/sheet";
import { EllipsizedAddress } from "#/components/wallet";
import { BackChevron } from "#/components/wallet/wallet-kit";
import { useAuthProfile } from "#/features/auth/hooks/use-profile";
import type { PretiumCashTransaction } from "@clc/api/features/pretium/client";
import { chainHasPretiumRamp } from "@clc/core/features/wallet/pretium";
import {
  usePretiumTransactionsByAddress,
  useTriggerPretiumOnramp,
  usePretiumRates,
} from "#/features/wallet/hooks/use-pretium";
import { cn } from "#/lib/utils";
import { CHAIN_ID, CHAIN_INFO } from "#/lib/chain";
import { explorerTxUrl } from "@clc/core/lib/constants/chains";
import { WithdrawSheet } from "./withdraw-sheet";

// We only onramp Tether. `ONRAMP_ASSET` is the Pretium asset code sent to the
// backend; `ONRAMP_ASSET_LABEL` is the branded display form (USD₮).
const ONRAMP_ASSET = "USDT" as const;
const ONRAMP_ASSET_LABEL = "USD₮";
const COMPLETE_PRETIUM_STATUSES = new Set(["COMPLETE", "COMPLETED", "SUCCESS", "SETTLED"]);

// Safaricom MSISDN ranges (0/+254/254 prefix). A non-match is a soft signal
// only: the line may be a ported Safaricom number, so we warn without blocking
// the top-up. MPESA only settles to Safaricom lines.
const SAFARICOM_REGEX = /^(?:0|\+?254)(?:11[0-5]|7(?:[0129][0-9]|4[0-3568]|5[7-9]|6[89]))[0-9]{6}$/;

function isSafaricomNumber(phone: string): boolean {
  return SAFARICOM_REGEX.test(phone.replace(/\s+/g, ""));
}

export function TopUpPage() {
  const { t } = useLingui();
  const { address } = useConnection();
  const profileQuery = useAuthProfile();
  const [amount, setAmount] = useState("");
  const [addStablesOpen, setAddStablesOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [selectedOnramp, setSelectedOnramp] = useState<PretiumCashTransaction | null>(null);
  const [selectedOfframp, setSelectedOfframp] = useState<PretiumCashTransaction | null>(null);

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
  const amountValue = Number(amount);
  const hasValidAmount =
    amount.trim() !== "" &&
    Number.isFinite(amountValue) &&
    amountValue >= 100 &&
    amountValue <= 250_000;
  const entryDisabled = !!disabledReason;
  const canContinue = !!cashAddress && hasKenyanPhone && hasValidAmount;

  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <BackChevron label={t`Wallet`} to="/" search={{ tab: "wallet" }} />

      <h1 className="mb-6 font-heading text-[1.75rem] font-bold leading-tight">
        <Trans>Cash</Trans>
      </h1>

      <div className="space-y-5">
        <section aria-labelledby="add-stables-title" className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <SectionHeading id="add-stables-title">
              <Trans>Add stables</Trans>
            </SectionHeading>
          </div>

          <button
            type="button"
            onClick={() => setAddStablesOpen(true)}
            className="flex w-full items-center gap-3 border border-border bg-card p-4 text-start active:bg-muted"
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
              className="rtl:-scale-x-100 size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          </button>
        </section>

        <section aria-labelledby="withdraw-title" className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <SectionHeading id="withdraw-title">
              <Trans>Withdraw</Trans>
            </SectionHeading>
          </div>

          <button
            type="button"
            onClick={() => setWithdrawOpen(true)}
            className="flex w-full items-center gap-3 border border-border bg-card p-4 text-start active:bg-muted"
          >
            <PretiumLogo />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm">
                <Trans>MPESA via Pretium</Trans>
              </p>
            </div>
            <RiArrowRightSLine
              className="rtl:-scale-x-100 size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          </button>
        </section>

        <PretiumHistory
          transactions={cashTransactions}
          isPending={!!cashAddress && transactionsQuery.isPending}
          isError={!!cashAddress && transactionsQuery.isError}
          retrying={transactionsQuery.isFetching}
          onRetry={() => {
            void transactionsQuery.refetch();
          }}
          onSelectOnramp={setSelectedOnramp}
          onSelectOfframp={setSelectedOfframp}
        />
      </div>

      <AddStablesSheet
        open={addStablesOpen}
        onOpenChange={setAddStablesOpen}
        amount={amount}
        amountValue={amountValue}
        onAmountChange={setAmount}
        address={cashAddress}
        phone={normalizedCashPhone}
        profilePending={profileQuery.isPending}
        disabledReason={disabledReason}
        entryDisabled={entryDisabled}
        hasValidAmount={hasValidAmount}
        canContinue={canContinue}
      />

      <WithdrawSheet
        open={withdrawOpen}
        onOpenChange={setWithdrawOpen}
        address={cashAddress}
        phone={normalizedCashPhone}
        disabledReason={disabledReason}
        entryDisabled={entryDisabled}
      />

      <OnrampDetailsSheet
        onramp={selectedOnramp}
        open={selectedOnramp !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedOnramp(null);
        }}
      />

      <OfframpDetailsSheet
        offramp={selectedOfframp}
        open={selectedOfframp !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedOfframp(null);
        }}
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
  const { i18n, t } = useLingui();
  const [amountFocused, setAmountFocused] = useState(false);
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
      onOpenChange(false);
    } catch {
      toast.error(t`Couldn't start MPESA top up`);
    }
  };

  return (
    <SheetRoot open={open} onOpenChange={onOpenChange}>
      <SheetPortal>
        <SheetBackdrop />
        <SheetContent className="[&>div:first-child]:hidden">
          <SheetHeader className="px-6 pt-5 pb-3">
            <div className="flex items-center gap-3">
              <PretiumLogo />
              <div>
                <SheetTitle>
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
                <div className="flex items-baseline gap-1.5">
                  <label htmlFor="topup-amount" className="text-muted-foreground text-xs">
                    <Trans>Amount</Trans>
                  </label>
                  <span className="text-muted-foreground text-xs">KES</span>
                </div>
                <div className="relative flex items-baseline gap-1.5">
                  <input
                    id="topup-amount"
                    dir="ltr"
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    onFocus={() => setAmountFocused(true)}
                    onBlur={() => setAmountFocused(false)}
                    onChange={(event) => onAmountChange(event.target.value.replace(/[^0-9.]/g, ""))}
                    placeholder="100"
                    size={Math.max(amount.length, 3)}
                    disabled={entryDisabled}
                    aria-invalid={amount !== "" && !hasValidAmount}
                    className={cn(
                      "bg-transparent text-end text-sm font-semibold tabular-nums caret-primary outline-none placeholder:text-muted-foreground [field-sizing:content]",
                      amount !== "" && !hasValidAmount && "text-destructive",
                      entryDisabled && "opacity-50",
                    )}
                  />
                  {!amount && !amountFocused ? (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none h-4 w-px animate-pulse bg-primary"
                    />
                  ) : null}
                </div>
              </div>

              <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-3 py-2.5">
                <span className="text-muted-foreground text-xs">
                  <Trans>MPESA phone</Trans>
                </span>
                <span className="text-xs font-semibold tabular-nums">
                  {profilePending ? "…" : phone || "—"}
                </span>
              </div>

              <div className="flex min-h-11 items-center justify-between gap-3 px-3 py-2.5">
                <span className="text-muted-foreground text-xs">
                  <Trans>You'll receive</Trans>
                </span>
                <span className="text-xs font-semibold tabular-nums">
                  {ratesQuery.isPending ? (
                    <span className="text-muted-foreground">…</span>
                  ) : approxUsdt !== null ? (
                    `≈ ${approxUsdt.toLocaleString(i18n.locales?.[0] ?? i18n.locale, {
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
              tap
              className="w-full"
              disabled={!canContinue}
              pending={triggerOnramp.isPending}
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
  retrying,
  onRetry,
  onSelectOnramp,
  onSelectOfframp,
}: {
  transactions: PretiumCashTransaction[];
  isPending: boolean;
  isError: boolean;
  retrying: boolean;
  onRetry: () => void;
  onSelectOnramp: (transaction: PretiumCashTransaction) => void;
  onSelectOfframp: (transaction: PretiumCashTransaction) => void;
}) {
  const { i18n } = useLingui();

  return (
    <section aria-labelledby="pretium-history-title" className="space-y-2">
      <SectionHeading id="pretium-history-title">
        <Trans>Pretium history</Trans>
      </SectionHeading>
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
            <Button variant="outline" tap pending={retrying} onClick={onRetry}>
              <Trans>Try again</Trans>
            </Button>
          </div>
        ) : null}
        {!isPending && !isError && transactions.length === 0 ? (
          <div className="flex gap-3 p-4 text-muted-foreground">
            <RiHistoryLine className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p className="font-medium text-foreground text-sm">
              <Trans>No cash activity yet.</Trans>
            </p>
          </div>
        ) : null}
        {transactions.map((transaction, index, list) => {
          const incoming = transaction.kind === "onramp";
          const complete = isCompletePretiumStatus(transaction.status);
          const Icon = complete ? RiCheckLine : RiTimeLine;
          return (
            <button
              key={`${transaction.kind}-${transaction.reference}`}
              type="button"
              onClick={() => {
                if (incoming) {
                  onSelectOnramp(transaction);
                  return;
                }
                onSelectOfframp(transaction);
              }}
              className={cn(
                "flex w-full items-center gap-2.5 p-3 text-start enabled:active:bg-muted",
                index < list.length - 1 && "border-b border-border",
              )}
            >
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center bg-muted",
                  complete ? "text-primary" : "text-amber-700 dark:text-amber-500",
                )}
              >
                <Icon className="size-3.5" aria-hidden="true" />
                <span className="sr-only">
                  {complete ? <Trans>Complete</Trans> : <Trans>Pending</Trans>}
                </span>
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn("font-medium text-sm", incoming && "text-primary")}>
                  {incoming ? <Trans>Onramp</Trans> : <Trans>Offramp</Trans>}
                </p>
                <p className="truncate text-muted-foreground text-xs">
                  {formatCashDate(transaction.createdAt, i18n.locales?.[0] ?? i18n.locale)}
                </p>
              </div>
              <span className="shrink-0 text-xs font-semibold tabular-nums">
                KES {formatHistoryKes(transaction)}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function OnrampDetailsSheet({
  onramp,
  open,
  onOpenChange,
}: {
  onramp: PretiumCashTransaction | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { i18n, t } = useLingui();
  const isComplete = onramp ? isCompletePretiumStatus(onramp.status) : false;
  const hasTxHash = !!onramp?.txHash;
  const explorerUrl = hasTxHash ? explorerTxUrl(CHAIN_INFO, onramp?.txHash ?? "") : "#";

  const copyPretiumId = (value: string) => {
    if (!navigator.clipboard) {
      toast.error(t`Couldn't copy Pretium ID`);
      return;
    }
    void navigator.clipboard
      .writeText(value)
      .then(() => toast.success(t`Pretium ID copied`))
      .catch(() => toast.error(t`Couldn't copy Pretium ID`));
  };

  return (
    <SheetRoot open={open} onOpenChange={onOpenChange}>
      <SheetPortal>
        <SheetBackdrop />
        <SheetContent className="[&>div:first-child]:hidden">
          <SheetHeader className="items-center px-6 pt-5 pb-3 text-center">
            <Badge caps>
              <Trans>Onramp</Trans>
            </Badge>
            <SheetTitle className="sr-only">
              <Trans>Onramp details</Trans>
            </SheetTitle>
          </SheetHeader>

          {onramp ? (
            <div className="px-6 pb-2">
              <div className="border border-border bg-card">
                <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-3 py-2.5">
                  <span className="text-muted-foreground text-xs">
                    <Trans>Status</Trans>
                  </span>
                  <Badge variant={isComplete ? "primary" : "muted"} size="sm" caps>
                    {onramp.status}
                  </Badge>
                </div>
                <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-3 py-2.5">
                  <span className="text-muted-foreground text-xs">
                    <Trans>Amount</Trans>
                  </span>
                  <span className="text-xs font-semibold tabular-nums">
                    KES {onramp.amountKes || "—"}
                  </span>
                </div>
                <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-3 py-2.5">
                  <span className="text-muted-foreground text-xs">
                    <Trans>Date</Trans>
                  </span>
                  <time className="text-xs font-semibold" dateTime={onramp.createdAt}>
                    {formatCashDate(onramp.createdAt, i18n.locales?.[0] ?? i18n.locale)}
                  </time>
                </div>
                <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-3 py-2.5">
                  <span className="text-muted-foreground text-xs">
                    <Trans>Pretium ID</Trans>
                  </span>
                  <CopyableIdentifier
                    value={onramp.reference}
                    label={t`Copy Pretium ID`}
                    onCopy={copyPretiumId}
                  />
                </div>
                <div className="flex min-h-11 items-center justify-between gap-3 px-3 py-2.5">
                  <span className="text-muted-foreground text-xs">
                    <Trans>Transaction</Trans>
                  </span>
                  {hasTxHash ? (
                    <EllipsizedAddress address={onramp.txHash} />
                  ) : (
                    <span className="text-muted-foreground text-xs">
                      <Trans>Pending</Trans>
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {hasTxHash ? (
            <SheetFooter className="px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
              <Button asChild tap className="w-full">
                <a href={explorerUrl} target="_blank" rel="noreferrer">
                  <Trans>View on block explorer</Trans>
                </a>
              </Button>
            </SheetFooter>
          ) : null}
        </SheetContent>
      </SheetPortal>
    </SheetRoot>
  );
}

function OfframpDetailsSheet({
  offramp,
  open,
  onOpenChange,
}: {
  offramp: PretiumCashTransaction | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { i18n, t } = useLingui();
  const isComplete = offramp ? isCompletePretiumStatus(offramp.status) : false;
  const hasTxHash = !!offramp?.txHash;
  const hasMpesaConfirmation = !!offramp?.mpesaConfirmation;
  const explorerUrl = hasTxHash ? explorerTxUrl(CHAIN_INFO, offramp?.txHash ?? "") : "#";

  const copyPretiumId = (value: string) => {
    if (!navigator.clipboard) {
      toast.error(t`Couldn't copy Pretium ID`);
      return;
    }
    void navigator.clipboard
      .writeText(value)
      .then(() => toast.success(t`Pretium ID copied`))
      .catch(() => toast.error(t`Couldn't copy Pretium ID`));
  };

  return (
    <SheetRoot open={open} onOpenChange={onOpenChange}>
      <SheetPortal>
        <SheetBackdrop />
        <SheetContent className="[&>div:first-child]:hidden">
          <SheetHeader className="items-center px-6 pt-5 pb-3 text-center">
            <Badge caps>
              <Trans>Offramp</Trans>
            </Badge>
            <SheetTitle className="sr-only">
              <Trans>Offramp details</Trans>
            </SheetTitle>
          </SheetHeader>

          {offramp ? (
            <div className="px-6 pb-2">
              <div className="border border-border bg-card">
                <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-3 py-2.5">
                  <span className="text-muted-foreground text-xs">
                    <Trans>Status</Trans>
                  </span>
                  <Badge variant={isComplete ? "primary" : "muted"} size="sm" caps>
                    {offramp.status}
                  </Badge>
                </div>
                <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-3 py-2.5">
                  <span className="text-muted-foreground text-xs">
                    <Trans>Amount</Trans>
                  </span>
                  <span className="text-xs font-semibold tabular-nums">
                    KES {offramp.amountKes || "—"}
                  </span>
                </div>
                <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-3 py-2.5">
                  <span className="text-muted-foreground text-xs">
                    <Trans>Stable sent</Trans>
                  </span>
                  <span className="text-xs font-semibold tabular-nums">
                    {offramp.amountUsd || "—"}
                  </span>
                </div>
                <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-3 py-2.5">
                  <span className="text-muted-foreground text-xs">
                    <Trans>MPESA phone</Trans>
                  </span>
                  <span className="text-xs font-semibold tabular-nums">
                    {offramp.phoneNumber || "—"}
                  </span>
                </div>
                {hasMpesaConfirmation ? (
                  <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-3 py-2.5">
                    <span className="text-muted-foreground text-xs">
                      <Trans>MPESA confirmation</Trans>
                    </span>
                    <span className="font-mono text-xs font-semibold">
                      {offramp.mpesaConfirmation}
                    </span>
                  </div>
                ) : null}
                <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-3 py-2.5">
                  <span className="text-muted-foreground text-xs">
                    <Trans>Date</Trans>
                  </span>
                  <time className="text-xs font-semibold" dateTime={offramp.createdAt}>
                    {formatCashDate(offramp.createdAt, i18n.locales?.[0] ?? i18n.locale)}
                  </time>
                </div>
                <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-3 py-2.5">
                  <span className="text-muted-foreground text-xs">
                    <Trans>Pretium ID</Trans>
                  </span>
                  <CopyableIdentifier
                    value={offramp.reference}
                    label={t`Copy Pretium ID`}
                    onCopy={copyPretiumId}
                  />
                </div>
                <div className="flex min-h-11 items-center justify-between gap-3 px-3 py-2.5">
                  <span className="text-muted-foreground text-xs">
                    <Trans>Transaction</Trans>
                  </span>
                  {hasTxHash ? (
                    <EllipsizedAddress address={offramp.txHash} />
                  ) : (
                    <span className="text-muted-foreground text-xs">
                      <Trans>Pending</Trans>
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {hasTxHash ? (
            <SheetFooter className="px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
              <Button asChild tap className="w-full">
                <a href={explorerUrl} target="_blank" rel="noreferrer">
                  <Trans>View on block explorer</Trans>
                </a>
              </Button>
            </SheetFooter>
          ) : null}
        </SheetContent>
      </SheetPortal>
    </SheetRoot>
  );
}

function CopyableIdentifier({
  value,
  label,
  onCopy,
}: {
  value: string;
  label: string;
  onCopy: (value: string) => void;
}) {
  return (
    <button
      type="button"
      className="flex min-w-0 items-center gap-1.5 bg-card text-end"
      aria-label={label}
      title={value}
      onClick={() => onCopy(value)}
    >
      <span className="min-w-0 font-mono text-muted-foreground text-xs">
        {shortenIdentifier(value)}
      </span>
      <span className="flex size-6 shrink-0 items-center justify-center bg-muted text-muted-foreground">
        <RiFileCopyLine className="size-3" aria-hidden="true" />
      </span>
    </button>
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

function isCompletePretiumStatus(status: string): boolean {
  return COMPLETE_PRETIUM_STATUSES.has(status.trim().toUpperCase());
}

function shortenIdentifier(value: string): string {
  if (value.length <= 14) return value;
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function timestamp(date: string): number {
  const value = Date.parse(date);
  return Number.isFinite(value) ? value : 0;
}

function formatHistoryKes(transaction: PretiumCashTransaction): string {
  if (!transaction.amountKes) return "—";
  return transaction.amountKes.split(".")[0] || transaction.amountKes;
}

function formatCashDate(date: string, locale: string): string {
  if (!date) return "—";
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return "—";
  return value.toLocaleDateString(locale, { month: "short", day: "numeric" });
}
