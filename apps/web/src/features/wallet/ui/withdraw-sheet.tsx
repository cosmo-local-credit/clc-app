import { formatTokenAmount } from "@clc/core/features/wallet/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { RiCheckLine, RiErrorWarningLine } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { TokenLogo } from "#/components/wallet";
import {
  SheetBackdrop,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetPortal,
  SheetRoot,
  SheetTitle,
} from "#/components/ui/sheet";
import { usePretiumWithdraw } from "#/features/wallet/hooks/use-pretium-cash";
import { accountTokenToWalletToken } from "#/features/wallet/logic/account-token-display";
import { cn } from "#/lib/utils";

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
  const { i18n } = useLingui();
  const form = usePretiumWithdraw({ open, address, phone, entryDisabled });
  const {
    eligible,
    selected,
    amount,
    setAmount,
    hasValidAmount,
    tokenToSend,
    linkReady,
    linkPreparing,
    linkFailed,
    sendError,
  } = form;

  const onWithdraw = async () => {
    if (await form.submit()) onOpenChange(false);
  };

  return (
    <SheetRoot open={open} onOpenChange={onOpenChange}>
      <SheetPortal>
        <SheetBackdrop />
        <SheetContent className="[&>div:first-child]:hidden">
          <SheetHeader className="px-6 pt-5 pb-3">
            <SheetTitle>
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
                <Button variant="outline" tap onClick={form.retryLink} pending={form.linkRetrying}>
                  <Trans>Try again</Trans>
                </Button>
              </div>
            ) : !linkReady || linkPreparing ? (
              <p className="text-muted-foreground text-sm">
                <Trans>Preparing your withdrawal…</Trans>
              </p>
            ) : form.tokensPending ? (
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
                    const displayToken = {
                      ...accountTokenToWalletToken(token),
                      symbol,
                      kind: "stable" as const,
                    };
                    return (
                      <button
                        key={token.tokenAddress}
                        type="button"
                        onClick={() => form.selectToken(token.tokenAddress)}
                        className={cn(
                          "flex w-full items-center gap-3 px-3 py-2.5 text-start enabled:active:bg-muted",
                          index < list.length - 1 && "border-b border-border",
                        )}
                      >
                        <TokenLogo token={displayToken} size={34} />
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
                    <div className="flex items-baseline gap-1.5">
                      <label htmlFor="withdraw-amount" className="text-muted-foreground text-xs">
                        <Trans>Amount</Trans>
                      </label>
                      <span className="text-muted-foreground text-xs">KES</span>
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <input
                        id="withdraw-amount"
                        dir="ltr"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={amount}
                        onChange={(event) => setAmount(event.target.value)}
                        placeholder="0"
                        size={Math.max(amount.length, 2)}
                        aria-invalid={amount !== "" && !hasValidAmount}
                        className={cn(
                          "bg-transparent text-end font-mono text-sm font-semibold caret-primary outline-none placeholder:text-muted-foreground [field-sizing:content]",
                          amount !== "" && !hasValidAmount && "text-destructive",
                        )}
                      />
                      <Button
                        variant="link"
                        tap
                        disabled={!form.canSetMax}
                        onClick={form.setMax}
                        className="-my-2 -me-3"
                      >
                        <Trans>Max</Trans>
                      </Button>
                    </div>
                  </div>

                  <div className="flex min-h-11 items-center justify-between gap-3 px-3 py-2.5">
                    <span className="text-muted-foreground text-xs">
                      <Trans>You'll send</Trans>
                    </span>
                    <span className="font-mono text-xs font-semibold">
                      {selected && hasValidAmount
                        ? `≈ ${tokenToSend.toLocaleString(i18n.locales?.[0] ?? i18n.locale, {
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
              tap
              className="w-full"
              disabled={!form.canWithdraw}
              pending={form.pending}
              onClick={() => void onWithdraw()}
            >
              {form.pending ? <Trans>Submitting…</Trans> : <Trans>Withdraw</Trans>}
            </Button>
          </SheetFooter>
        </SheetContent>
      </SheetPortal>
    </SheetRoot>
  );
}
