import { RecipientIdentityLabel } from "#/components/wallet/recipient-identity-label";
import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { RiArrowDownSLine } from "react-icons/ri";
import { useConnection } from "wagmi";

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
import { TokenLogo } from "#/components/wallet";
import type { ResolvedRecipientAddress } from "#/components/wallet/recipient-address-input";
import { BackChevron } from "#/components/wallet/wallet-kit";
import { useSendDraft } from "#/features/wallet/hooks/use-send-draft";
import { useSendPayment } from "#/features/wallet/hooks/use-send-payment";
import { cn } from "#/lib/utils";
import { TokenPickerSheet } from "./token-picker-sheet";

export function SendAmountPage({
  token,
  recipient: recipientProp,
  recipientLabel: recipientLabelProp,
  amount: seededAmount,
  returnPool,
}: {
  token?: string;
  recipient?: string;
  recipientLabel?: string;
  /** Prefilled amount from a shortcut into this screen, such as send-after-swap. */
  amount?: string;
  /** Pool whose Deposit shortcut opened this screen; carried on to the receipt. */
  returnPool?: string;
}) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const { address } = useConnection();

  // After a zoom or resize from the desktop view the page opens with what was
  // typed there. A restored recipient replaces the URL's, and no recipient in
  // the draft means none is shown: this page never pays someone the person was
  // no longer looking at. The confirmation sheet is not restored.
  const draft = useSendDraft(address);
  const restored = draft.restored;
  const seededAddress = recipientProp?.startsWith("0x") ? (recipientProp as `0x${string}`) : null;
  const recipient: ResolvedRecipientAddress | null = restored
    ? (restored.recipient ?? null)
    : seededAddress
      ? { address: seededAddress, name: recipientLabelProp ?? null, source: "manual" }
      : null;
  const payment = useSendPayment({
    sender: address,
    draft,
    seed: {
      token,
      amount: seededAmount,
      recipient: recipientProp,
      recipientLabel: recipientLabelProp,
      returnPool,
    },
    query: recipient?.address ?? "",
    recipient,
  });
  const { tokens, tokensQuery, selectedToken, amount, exceedsBalance, unitValueLabel } = payment;
  const { recipientAddress, recipientLabel } = payment;
  // Preserve the current token selection when editing the recipient.
  const tokenParam = selectedToken?.contractAddress ?? selectedToken?.id ?? token;

  const [amountFocused, setAmountFocused] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const amountInputRef = useRef<HTMLInputElement>(null);
  const tokenSelectorRef = useRef<HTMLButtonElement>(null);
  const focusAmountAfterSelectionRef = useRef(false);

  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)] pb-bottom-nav">
      <BackChevron label={t`Send`} to="/wallet/send" search={{ token: tokenParam }} />

      <h1 className="font-heading mb-3.5 text-[1.75rem] font-bold leading-tight">
        <Trans>Amount</Trans>
      </h1>

      {recipientAddress ? (
        <div className="mb-2.5 flex h-12 items-center gap-2.5 border border-border bg-card px-3">
          <span className="shrink-0 text-muted-foreground text-xs">
            <Trans>To</Trans>
          </span>
          <div className="min-w-0 flex-1">
            {recipientLabel ? (
              <p dir="auto" className="truncate font-medium text-xs">
                {recipientLabel}
              </p>
            ) : (
              <RecipientIdentityLabel address={recipientAddress} />
            )}
          </div>
          {/* Changing the recipient leaves the deposit: `returnPool` is not
              carried, because a send to someone else should end on the wallet
              rather than on a pool it never reached. */}
          <Button
            variant="link"
            tap
            className="-me-3"
            onClick={() => {
              void navigate({ to: "/wallet/send", search: { token: tokenParam } });
            }}
          >
            <Trans>Edit</Trans>
          </Button>
        </div>
      ) : null}

      <button
        ref={tokenSelectorRef}
        type="button"
        onClick={() => setPickerOpen(true)}
        disabled={tokens.length === 0}
        className="mb-2.5 flex h-11 w-full items-center gap-2.5 border border-border bg-card px-3 text-start disabled:opacity-60"
      >
        {selectedToken ? (
          <>
            <TokenLogo token={selectedToken} size={30} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{selectedToken.symbol}</p>
              <p className="text-muted-foreground text-xs">
                <Trans>Balance {selectedToken.amount}</Trans>
              </p>
            </div>
          </>
        ) : (
          <div className="min-w-0 flex-1">
            <p className="text-muted-foreground text-sm">
              {tokensQuery.isError ? (
                <Trans>Couldn't load tokens</Trans>
              ) : tokens.length > 0 ? (
                <Trans>Select a token</Trans>
              ) : !tokensQuery.isPending ? (
                <Trans>No tokens available</Trans>
              ) : (
                <Trans>Loading tokens…</Trans>
              )}
            </p>
          </div>
        )}
        <RiArrowDownSLine className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>

      {/* The whole tile is the hit target. `field-sizing:content` shrinks the
          input to the width of what has been typed, so an empty field is a few
          pixels wide and nobody finds it.

          A real `<label>` rather than a pointer handler. A handler has to call
          preventDefault to stop the press blurring the field, and iOS Safari —
          an installed PWA especially — then reads the press as a tap that ended
          on nothing focusable: it raised the keypad for the programmatic
          `focus()` and dismissed it again on touch end, leaving the few pixels
          of caret as the only target that worked. Label activation is the one
          path WebKit treats as a genuine tap on the control itself, and it
          needs no script at all.

          The label is an overlay under the tile's own controls, not a wrapper
          around them: a label may hold only its own labelled control, and one
          wrapping the Max button would both be invalid and steal its presses.
          Everything above it keeps `relative` so it stays tappable — the input
          included, so a tap on a digit still puts the caret there. */}
      <div className="relative mb-2.5 flex flex-col items-center border border-border bg-card px-4 py-5">
        <label htmlFor="send-amount" className="absolute inset-0 cursor-text">
          <span className="sr-only">
            <Trans>Amount</Trans>
          </span>
        </label>
        <div className="relative flex items-baseline justify-center gap-1.5">
          <div className="relative flex items-baseline">
            <input
              ref={amountInputRef}
              id="send-amount"
              type="text"
              dir="ltr"
              inputMode="decimal"
              autoFocus
              value={amount}
              onFocus={() => setAmountFocused(true)}
              onBlur={() => setAmountFocused(false)}
              onChange={(event) => payment.setAmount(event.target.value)}
              // field-sizing sizes the input to its text exactly, so the
              // number + symbol pair centers true. size is the pre-support fallback.
              size={Math.max(amount.length, 1)}
              aria-invalid={exceedsBalance}
              aria-describedby={unitValueLabel ? "send-amount-uoa-value" : undefined}
              className={cn(
                "min-w-0 bg-transparent text-center font-heading text-[2.5rem] font-semibold leading-none tracking-tight caret-primary outline-none [field-sizing:content]",
                exceedsBalance && "text-destructive",
              )}
            />
            {!amount && !amountFocused ? (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-1/2 h-7 w-px -translate-x-1/2 -translate-y-1/2 animate-pulse bg-primary"
              />
            ) : null}
          </div>
          <span className="text-xl text-muted-foreground">{selectedToken?.symbol}</span>
        </div>
        {unitValueLabel ? (
          <p
            id="send-amount-uoa-value"
            className="relative mt-2 font-mono text-muted-foreground text-sm tabular-nums"
            aria-live="polite"
          >
            ({unitValueLabel})
          </p>
        ) : null}
        {selectedToken ? (
          <Button variant="secondary" tap className="mt-3" onClick={payment.setMax}>
            <Trans>Use max · {selectedToken.amount}</Trans>
          </Button>
        ) : null}
        {exceedsBalance ? (
          <p className="relative mt-2 text-destructive text-xs">
            <Trans>Amount exceeds your balance</Trans>
          </p>
        ) : null}
      </div>

      <div className="flex-1" />

      {/* Disarmed while any send is relaying, including one the desktop view
          started before a resize brought this page back. */}
      <Button
        tap
        className="w-full"
        disabled={!payment.canSend}
        pending={payment.inFlight}
        onClick={() => setConfirmOpen(true)}
      >
        {payment.inFlight ? t`Sending…` : t`Send`}
      </Button>

      <TokenPickerSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        tokens={tokens}
        selectedId={selectedToken?.id}
        onSelect={(next) => {
          focusAmountAfterSelectionRef.current = true;
          payment.selectToken(next.id);
        }}
        finalFocus={() => {
          if (focusAmountAfterSelectionRef.current) {
            focusAmountAfterSelectionRef.current = false;
            return amountInputRef.current;
          }
          return tokenSelectorRef.current;
        }}
      />

      <SendConfirmationSheet
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        amount={payment.submittedVoucherAmount}
        symbol={selectedToken?.symbol ?? ""}
        unitValueLabel={unitValueLabel}
        recipient={recipientAddress}
        recipientLabel={recipientLabel}
        error={payment.error}
        isPending={payment.inFlight}
        onConfirm={payment.confirm}
      />
    </div>
  );
}

function SendConfirmationSheet({
  open,
  onOpenChange,
  amount,
  symbol,
  unitValueLabel,
  recipient,
  recipientLabel,
  error,
  isPending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amount: string;
  symbol: string;
  unitValueLabel: string | null;
  recipient: `0x${string}` | null;
  recipientLabel?: string;
  error: string | null;
  isPending: boolean;
  onConfirm: () => Promise<void>;
}) {
  return (
    <SheetRoot open={open} onOpenChange={onOpenChange}>
      <SheetPortal>
        <SheetBackdrop />
        <SheetContent className="[&>div:first-child]:hidden">
          <SheetHeader className="px-6 pt-5 pb-3">
            <SheetTitle>
              <Trans>Confirm send</Trans>
            </SheetTitle>
          </SheetHeader>

          <div className="px-6 pb-2">
            <div className="border border-border bg-card">
              <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-3 py-2.5">
                <span className="text-muted-foreground text-xs">
                  <Trans>Amount</Trans>
                </span>
                <span className="min-w-0 text-end font-mono text-xs font-semibold [overflow-wrap:anywhere]">
                  {amount} {symbol}
                  {unitValueLabel ? ` (${unitValueLabel})` : ""}
                </span>
              </div>
              <div className="flex min-h-11 items-center justify-between gap-3 px-3 py-2.5">
                <span className="text-muted-foreground text-xs">
                  <Trans>Recipient</Trans>
                </span>
                {recipient ? (
                  <RecipientIdentityLabel
                    address={recipient}
                    fallback={recipientLabel}
                    showAddress
                  />
                ) : null}
              </div>
            </div>
          </div>

          {error ? (
            <p className="px-6 pb-2 text-destructive text-xs" role="alert">
              {error}
            </p>
          ) : null}

          <SheetFooter className="px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <Button tap className="w-full" pending={isPending} onClick={() => void onConfirm()}>
              {isPending ? <Trans>Sending…</Trans> : <Trans>Confirm and send</Trans>}
            </Button>
            <Button
              variant="ghost"
              tap
              className="w-full"
              disabled={isPending}
              onClick={() => onOpenChange(false)}
            >
              <Trans>Cancel</Trans>
            </Button>
          </SheetFooter>
        </SheetContent>
      </SheetPortal>
    </SheetRoot>
  );
}
