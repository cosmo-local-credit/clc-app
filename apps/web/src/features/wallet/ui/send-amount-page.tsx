import { RecipientIdentityLabel } from "#/components/wallet/recipient-identity-label";
import {
  formatUnitOfAccountDisplayValue,
  formatVoucherUnitValue,
} from "@clc/core/features/market/logic";
import {
  formatTokenAmount,
  formatTokenAmountFixed,
  parseTokenAmount,
} from "@clc/core/features/wallet/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { BackChevron } from "#/components/wallet/wallet-kit";
import { useMarketVoucherDetail } from "#/features/home/hooks/use-market-voucher-detail";
import { useAllAccountTokens } from "#/features/wallet/hooks/use-account-balances";
import { useSendVoucherTransfer } from "#/features/wallet/hooks/use-send-voucher-transfer";
import { accountTokenToWalletToken } from "#/features/wallet/logic/account-token-display";
import { relaySnapshotUnitValue } from "#/features/wallet/logic/relay-valuation";
import { useCaliburDelegation } from "#/features/webauthn/hooks/use-calibur-delegation";
import { cn } from "#/lib/utils";
import { TokenPickerSheet } from "./token-picker-sheet";

/** Keep only digits and a single decimal point, capped at 2 fraction digits. */
function sanitizeAmount(raw: string): string {
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

export function SendAmountPage({
  token,
  recipient,
  recipientLabel,
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
  const { i18n, t } = useLingui();
  const navigate = useNavigate();
  const { address } = useConnection();
  const delegationStatus = useCaliburDelegation(address as `0x${string}` | undefined);
  const tokensQuery = useAllAccountTokens(address);
  const sendVoucher = useSendVoucherTransfer();
  const tokens = tokensQuery.tokens
    .filter((item) => item.catalogActive !== false)
    .map(accountTokenToWalletToken);

  // Preselect the token passed from the token detail page; fall back to the
  // first token once balances load if none was requested. Never substitute a
  // different asset for a retired selection. `selectedId` mirrors the fetched token id
  // (the lowercased contract address).
  const [selectedId, setSelectedId] = useState<string | undefined>(token?.toLowerCase());
  const selectedToken = selectedId ? tokens.find((item) => item.id === selectedId) : tokens[0];
  const firstTokenId = tokens[0]?.id;
  useEffect(() => {
    if (!selectedId && firstTokenId) setSelectedId(firstTokenId);
  }, [selectedId, firstTokenId]);
  // Preserve the current token selection when editing the recipient.
  const tokenParam = selectedToken?.contractAddress ?? selectedToken?.id ?? token;

  // Seeded once. The param is a starting point a shortcut chose, not a
  // controlled value — typing over it must not be undone by a re-render.
  const [amount, setAmount] = useState(() => sanitizeAmount(seededAmount ?? ""));
  const [amountFocused, setAmountFocused] = useState(false);
  const [maxAmountRaw, setMaxAmountRaw] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const amountInputRef = useRef<HTMLInputElement>(null);
  const tokenSelectorRef = useRef<HTMLButtonElement>(null);
  const focusAmountAfterSelectionRef = useRef(false);

  const tokenDecimals = selectedToken?.tokenDecimals ?? 2;
  const voucherDetail = useMarketVoucherDetail(selectedToken?.contractAddress);
  const parsedAmountRaw = useMemo(() => {
    if (!selectedToken || amount.trim() === "") return null;
    try {
      return maxAmountRaw ?? parseTokenAmount(amount, tokenDecimals);
    } catch {
      return null;
    }
  }, [amount, maxAmountRaw, selectedToken, tokenDecimals]);
  const exactVoucherAmount =
    parsedAmountRaw === null
      ? null
      : formatTokenAmount(parsedAmountRaw, tokenDecimals, tokenDecimals);
  const submittedVoucherAmount = maxAmountRaw ? (exactVoucherAmount ?? amount) : amount;
  const unitValue =
    exactVoucherAmount === null
      ? null
      : formatVoucherUnitValue(
          exactVoucherAmount,
          voucherDetail.data?.voucherValue ?? null,
          voucherDetail.data?.voucherUoa ?? null,
        );
  const localizedUnitValue = unitValue
    ? (formatUnitOfAccountDisplayValue(unitValue.value, i18n.locales?.[0] ?? i18n.locale) ??
      unitValue.value)
    : null;
  const unitValueLabel =
    exactVoucherAmount === null
      ? null
      : unitValue && localizedUnitValue
        ? `${localizedUnitValue} ${unitValue.unit}`
        : voucherDetail.isPending
          ? t`Loading…`
          : t`Unavailable`;
  const balanceRaw = selectedToken?.balance ?? null;
  const amountValue = Number(amount);
  const isValidAmount =
    amount.trim() !== "" &&
    Number.isFinite(amountValue) &&
    amountValue > 0 &&
    parsedAmountRaw !== null &&
    BigInt(parsedAmountRaw) > 0n;
  const exceedsMax =
    isValidAmount && balanceRaw !== null
      ? BigInt(parsedAmountRaw) > BigInt(balanceRaw)
      : selectedToken
        ? amountValue > Number(selectedToken.amount.replace(/,/g, ""))
        : false;
  const recipientAddress =
    recipient && recipient.startsWith("0x") ? (recipient as `0x${string}`) : null;
  const tokenAddress = selectedToken?.contractAddress
    ? (selectedToken.contractAddress as `0x${string}`)
    : null;
  const canSend =
    !!address &&
    !!recipientAddress &&
    !!tokenAddress &&
    !!selectedToken &&
    delegationStatus !== "checking" &&
    isValidAmount &&
    !exceedsMax;

  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
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
              onChange={(event) => {
                setMaxAmountRaw(null);
                setAmount(sanitizeAmount(event.target.value));
              }}
              // field-sizing sizes the input to its text exactly, so the
              // number + symbol pair centers true. size is the pre-support fallback.
              size={Math.max(amount.length, 1)}
              aria-invalid={exceedsMax}
              aria-describedby={unitValueLabel ? "send-amount-uoa-value" : undefined}
              className={cn(
                "min-w-0 bg-transparent text-center text-[1.75rem] font-semibold leading-none tabular-nums caret-primary outline-none [field-sizing:content]",
                exceedsMax && "text-destructive",
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
            className="relative mt-2 text-muted-foreground text-sm tabular-nums"
            aria-live="polite"
          >
            ({unitValueLabel})
          </p>
        ) : null}
        {selectedToken ? (
          <Button
            variant="secondary"
            tap
            className="mt-3"
            onClick={() => {
              if (selectedToken.balance) {
                setAmount(formatTokenAmountFixed(selectedToken.balance, tokenDecimals, 2));
                setMaxAmountRaw(selectedToken.balance);
                return;
              }
              setMaxAmountRaw(null);
              setAmount(selectedToken.amount.replace(/,/g, ""));
            }}
          >
            <Trans>Use max · {selectedToken.amount}</Trans>
          </Button>
        ) : null}
        {exceedsMax ? (
          <p className="relative mt-2 text-destructive text-xs">
            <Trans>Amount exceeds your balance</Trans>
          </p>
        ) : null}
      </div>

      <div className="flex-1" />

      <Button
        tap
        className="w-full"
        disabled={!canSend || sendVoucher.isPending}
        onClick={() => setConfirmOpen(true)}
      >
        {t`Send`}
      </Button>

      <TokenPickerSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        tokens={tokens}
        selectedId={selectedToken?.id}
        onSelect={(next) => {
          focusAmountAfterSelectionRef.current = true;
          setMaxAmountRaw(null);
          setSelectedId(next.id);
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
        amount={submittedVoucherAmount}
        symbol={selectedToken?.symbol ?? ""}
        unitValueLabel={unitValueLabel}
        recipient={recipientAddress}
        recipientLabel={recipientLabel}
        error={sendVoucher.error instanceof Error ? sendVoucher.error.message : null}
        isPending={sendVoucher.isPending}
        onConfirm={async () => {
          if (!canSend || !selectedToken || !parsedAmountRaw || !tokenAddress || !recipientAddress)
            return;
          const result = await sendVoucher
            .mutateAsync({
              senderAddress: address as `0x${string}`,
              tokenAddress,
              recipientAddress,
              amountRaw: parsedAmountRaw,
              includeAuthorization: delegationStatus === "not-delegated",
            })
            .catch(() => null);
          if (!result) return;
          const submittedUnitValue = relaySnapshotUnitValue(
            result.valuationSnapshots,
            tokenAddress,
            exactVoucherAmount ?? amount,
          );
          void navigate({
            to: "/wallet/send/receipt",
            search: {
              trackingId: result.trackingId,
              token: tokenAddress,
              recipient: recipientAddress,
              recipientLabel,
              amount: submittedVoucherAmount,
              symbol: selectedToken.symbol,
              ...(submittedUnitValue
                ? { uoaValue: submittedUnitValue.value, uoa: submittedUnitValue.unit }
                : { uoaUnavailable: true }),
              returnPool,
            },
          });
        }}
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
                <span className="min-w-0 text-end text-xs font-semibold tabular-nums [overflow-wrap:anywhere]">
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
