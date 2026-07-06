import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { parsePhoneNumber } from "react-phone-number-input";
import { RiErrorWarningLine, RiSmartphoneLine } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { BackChevron } from "#/components/wallet/wallet-kit";
import { useAuthProfile } from "#/features/auth/hooks/use-profile";
import { cn } from "#/lib/utils";

function isKenyanPhoneNumber(phone: string): boolean {
  const parsed = parsePhoneNumber(phone);
  return parsed?.country === "KE";
}

export function TopUpPage() {
  const { t } = useLingui();
  const profileQuery = useAuthProfile();
  const [amount, setAmount] = useState("20");

  const phone = profileQuery.data?.phone.trim() ?? "";
  const hasPhone = phone.length > 0;
  const hasKenyanPhone = hasPhone && isKenyanPhoneNumber(phone);
  const disabledReason = profileQuery.isPending
    ? t`Loading your profile…`
    : profileQuery.isError
      ? t`We couldn't load your profile phone number.`
      : !hasPhone
        ? t`Add a phone number to your profile to use M-PESA.`
        : !hasKenyanPhone
          ? t`M-PESA top ups need a Kenyan phone number.`
          : null;
  const amountValue = Number(amount);
  const hasValidAmount = amount.trim() !== "" && Number.isFinite(amountValue) && amountValue > 0;
  const entryDisabled = !!disabledReason;
  const canContinue = hasKenyanPhone && hasValidAmount;

  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <BackChevron label={t`Top up`} to="/" />

      <div className="mb-6 space-y-1">
        <h1 className="font-heading text-[1.75rem] font-bold leading-tight">
          <Trans>Add stables</Trans>
        </h1>
        <p className="text-muted-foreground text-sm">
          <Trans>Buy stables with local money.</Trans>
        </p>
      </div>

      <div className="space-y-3">
        <div className="border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <img
              src="/pretium.png"
              alt=""
              className="size-11 shrink-0 border border-border bg-card object-contain"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-base">M-PESA</p>
              <p className="text-muted-foreground text-xs">
                <Trans>Powered by Pretium</Trans>
              </p>
            </div>
            <RiSmartphoneLine
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          </div>
        </div>

        <div className="space-y-4 border border-border bg-card p-4">
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
              <span className="mr-2 shrink-0 text-muted-foreground text-sm font-semibold">KES</span>
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
        </div>

        {disabledReason ? (
          <div className="flex gap-2 border border-border bg-card p-3 text-muted-foreground text-xs">
            <RiErrorWarningLine className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>{disabledReason}</p>
          </div>
        ) : null}
      </div>

      <div className="flex-1" />

      <Button className="h-11 w-full" disabled={!canContinue}>
        <Trans>Continue</Trans>
      </Button>
    </div>
  );
}
