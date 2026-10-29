import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import {
  RiArrowRightSLine,
  RiCheckLine,
  RiErrorWarningLine,
  RiFileCopyLine,
  RiHistoryLine,
  RiTimeLine,
} from "react-icons/ri";
import { toast } from "sonner";

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
import type { PretiumCashTransaction } from "@clc/api/features/pretium/client";
import { useAddStables, useCashAccess } from "#/features/wallet/hooks/use-pretium-cash";
import {
  formatCashDate,
  formatHistoryKes,
  isCompletePretiumStatus,
  ONRAMP_ASSET_LABEL,
  shortenIdentifier,
} from "#/features/wallet/logic/pretium-cash";
import { cn } from "#/lib/utils";
import { CHAIN_INFO } from "#/lib/chain";
import { explorerTxUrl } from "@clc/core/lib/constants/chains";
import { WithdrawSheet } from "./withdraw-sheet";

export function TopUpPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { t } = useLingui();
  const [addStablesOpen, setAddStablesOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [selectedOnramp, setSelectedOnramp] = useState<PretiumCashTransaction | null>(null);
  const [selectedOfframp, setSelectedOfframp] = useState<PretiumCashTransaction | null>(null);

  const access = useCashAccess();
  const { cashAddress, cashTransactions, transactionsQuery, disabledReason, entryDisabled } =
    access;
  const addStables = useAddStables({ access, ratesEnabled: addStablesOpen });

  return (
    <div
      className={
        embedded
          ? "flex flex-col"
          : "flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      }
    >
      {embedded ? null : <BackChevron label={t`Wallet`} to="/" search={{ tab: "wallet" }} />}

      <h1
        className={
          embedded
            ? "font-heading text-[1.75rem] font-bold leading-tight"
            : "mb-6 font-heading text-[1.75rem] font-bold leading-tight"
        }
      >
        <Trans>Cash</Trans>
      </h1>

      <div className={embedded ? "mt-6 grid grid-cols-2 gap-6" : "space-y-5"}>
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

        <div className={embedded ? "col-span-2" : undefined}>
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
      </div>

      <AddStablesSheet
        open={addStablesOpen}
        onOpenChange={setAddStablesOpen}
        form={addStables}
        phone={access.phone}
        profilePending={access.profilePending}
        disabledReason={disabledReason}
        entryDisabled={entryDisabled}
      />

      <WithdrawSheet
        open={withdrawOpen}
        onOpenChange={setWithdrawOpen}
        address={cashAddress}
        phone={access.phone}
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
  form,
  phone,
  profilePending,
  disabledReason,
  entryDisabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: ReturnType<typeof useAddStables>;
  phone: string;
  profilePending: boolean;
  disabledReason: string | null;
  entryDisabled: boolean;
}) {
  const { i18n } = useLingui();
  const [amountFocused, setAmountFocused] = useState(false);
  const { amount, hasValidAmount, approxUsdt, showSafaricomWarning, mutationError } = form;

  const onContinue = async () => {
    if (await form.submit()) onOpenChange(false);
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
                    onChange={(event) => form.setAmount(event.target.value)}
                    placeholder="100"
                    size={Math.max(amount.length, 3)}
                    disabled={entryDisabled}
                    aria-invalid={amount !== "" && !hasValidAmount}
                    className={cn(
                      "bg-transparent text-end font-mono text-sm font-semibold caret-primary outline-none placeholder:text-muted-foreground [field-sizing:content]",
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
                <span className="font-mono text-xs font-semibold">
                  {profilePending ? "…" : phone || "—"}
                </span>
              </div>

              <div className="flex min-h-11 items-center justify-between gap-3 px-3 py-2.5">
                <span className="text-muted-foreground text-xs">
                  <Trans>You'll receive</Trans>
                </span>
                <span className="font-mono text-xs font-semibold">
                  {form.ratesPending ? (
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
              disabled={!form.canContinue}
              pending={form.pending}
              onClick={() => void onContinue()}
            >
              {form.pending ? <Trans>Starting…</Trans> : <Trans>Continue</Trans>}
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
              <span className="shrink-0 font-mono text-xs font-semibold">
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
                  <span className="font-mono text-xs font-semibold">
                    KES {onramp.amountKes || "—"}
                  </span>
                </div>
                <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-3 py-2.5">
                  <span className="text-muted-foreground text-xs">
                    <Trans>Date</Trans>
                  </span>
                  <time className="font-mono text-xs font-semibold" dateTime={onramp.createdAt}>
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
                  <span className="font-mono text-xs font-semibold">
                    KES {offramp.amountKes || "—"}
                  </span>
                </div>
                <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-3 py-2.5">
                  <span className="text-muted-foreground text-xs">
                    <Trans>Stable sent</Trans>
                  </span>
                  <span className="font-mono text-xs font-semibold">
                    {offramp.amountUsd || "—"}
                  </span>
                </div>
                <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-3 py-2.5">
                  <span className="text-muted-foreground text-xs">
                    <Trans>MPESA phone</Trans>
                  </span>
                  <span className="font-mono text-xs font-semibold">
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
                  <time className="font-mono text-xs font-semibold" dateTime={offramp.createdAt}>
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
