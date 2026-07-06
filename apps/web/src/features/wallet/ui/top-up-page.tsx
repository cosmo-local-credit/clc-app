import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { parsePhoneNumber } from "react-phone-number-input";
import { RiArrowRightSLine, RiErrorWarningLine, RiHistoryLine } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { BackChevron } from "#/components/wallet/wallet-kit";
import { useAuthProfile } from "#/features/auth/hooks/use-profile";
import { cn } from "#/lib/utils";

export function TopUpPage() {
  const { t } = useLingui();
  const profileQuery = useAuthProfile();
  const [amount, setAmount] = useState("20");

  const phone = profileQuery.data?.phone.trim() ?? "";
  const parsedPhone = phone ? parsePhoneNumber(phone) : undefined;
  const hasPhone = phone.length > 0;
  const hasKenyanPhone = parsedPhone?.country === "KE";
  const disabledReason = profileQuery.isPending
    ? t`Loading your profile…`
    : profileQuery.isError
      ? t`We couldn't load your profile phone number.`
      : !hasPhone
        ? t`Add a phone number to your profile to use M-PESA.`
        : !hasKenyanPhone
          ? t`M-PESA cash services need a Kenyan phone number.`
          : null;
  const amountValue = Number(amount);
  const hasValidAmount = amount.trim() !== "" && Number.isFinite(amountValue) && amountValue > 0;
  const entryDisabled = !!disabledReason;
  const canContinue = hasKenyanPhone && hasValidAmount;

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
            <span className="text-muted-foreground text-xs">M-PESA</span>
          </div>

          <div className="space-y-4 border border-border bg-card p-4">
            <div className="flex items-center gap-3">
              <img
                src="/pretium.png"
                alt=""
                className="size-11 shrink-0 border border-border bg-card object-contain"
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm">
                  <Trans>M-PESA via Pretium</Trans>
                </p>
                <p className="text-muted-foreground text-xs">
                  <Trans>Buy stables with KES.</Trans>
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="topup-phone" className="font-medium text-sm">
                <Trans>M-PESA phone</Trans>
              </label>
              <Input
                id="topup-phone"
                type="tel"
                value={profileQuery.isPending ? "" : phone}
                placeholder={t`No phone number`}
                readOnly
                disabled={entryDisabled}
                aria-invalid={!!disabledReason && !profileQuery.isPending}
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
                  value={amount}
                  onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))}
                  placeholder="20"
                  disabled={entryDisabled}
                  aria-invalid={!hasValidAmount}
                  className="h-auto min-h-0 border-0 bg-transparent px-0 py-0 font-heading text-xl font-semibold tracking-tight focus-visible:border-0"
                />
              </div>
            </div>

            {disabledReason ? (
              <div className="flex gap-2 border border-border bg-background p-3 text-muted-foreground text-xs">
                <RiErrorWarningLine className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <p>{disabledReason}</p>
              </div>
            ) : null}

            <p className="text-muted-foreground text-xs">
              <Trans>Rates and fees will be shown before you confirm.</Trans>
            </p>

            <Button className="h-11 w-full" disabled={!canContinue}>
              <Trans>Continue</Trans>
            </Button>
          </div>
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
            <img
              src="/pretium.png"
              alt=""
              className="size-11 shrink-0 border border-border bg-card object-contain"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm">
                <Trans>M-PESA via Pretium</Trans>
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

        <section aria-labelledby="pretium-history-title" className="space-y-2">
          <h2 id="pretium-history-title" className="font-heading font-semibold text-base">
            <Trans>Pretium history</Trans>
          </h2>
          <div className="flex gap-3 border border-border bg-card p-4 text-muted-foreground">
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
        </section>
      </div>
    </div>
  );
}
