import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { RiArrowDownLine, RiArrowDownSLine, RiCheckLine } from "react-icons/ri";

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
import { SignHint, TokenLogo, WALLET_TOKENS, type WalletToken } from "#/components/wallet";
import { BackChevron } from "#/components/wallet/wallet-kit";
import { usePoolVouchers } from "#/features/pools/hooks/use-pool-vouchers";
import { useUserPoolByAddress } from "#/features/pools/hooks/use-user-pools";
import { cn } from "#/lib/utils";

const PLACEHOLDER_RATE = 0.994;

export function PoolSwapPage({ poolAddress }: { poolAddress: string }) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const poolQuery = useUserPoolByAddress(poolAddress);
  const pool = poolQuery.data;
  const vouchers = usePoolVouchers(pool);
  const receiveTokens = useMemo(
    () =>
      vouchers.map(
        (voucher): WalletToken => ({
          id: voucher.id,
          symbol: voucher.symbol,
          name: voucher.name,
          amount: "0",
          fiat: "",
          color: "oklch(0.55 0.14 250)",
          kind: "voucher",
          glyph: voucher.symbol.slice(0, 2),
        }),
      ),
    [vouchers],
  );

  const [payToken, setPayToken] = useState<WalletToken>(
    WALLET_TOKENS.find((token) => token.id === "usdc") ?? WALLET_TOKENS[0],
  );
  const [receiveTokenId, setReceiveTokenId] = useState<string | undefined>(undefined);
  const [payAmount, setPayAmount] = useState("25.00");
  const [picker, setPicker] = useState<null | { field: "pay" | "receive" }>(null);

  const selectedReceive =
    receiveTokens.find((token) => token.id === receiveTokenId) ?? receiveTokens[0];
  const estimate = usePlaceholderSwapEstimate(payAmount);
  const isValidAmount = estimate.payAmountNumber > 0;
  const detailFallback = `/pools/${poolAddress}`;

  if (poolQuery.isLoading) {
    return <SwapShell fallbackTo={detailFallback} message={t`Loading pool…`} />;
  }
  if (poolQuery.isError) {
    return <SwapShell fallbackTo={detailFallback} message={t`Couldn't load this pool.`} />;
  }
  if (!pool) {
    return <SwapShell fallbackTo={detailFallback} message={t`Pool not found.`} />;
  }

  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <BackChevron label={t`Swap`} to={detailFallback} />

      <h1 className="font-heading mb-3.5 text-[1.75rem] font-bold leading-tight">
        <Trans>Swap</Trans>
      </h1>

      <div className="relative flex flex-col gap-1">
        <SwapField
          label={t`You pay`}
          token={payToken}
          amount={payAmount}
          max={payToken.amount}
          onAmountChange={setPayAmount}
          onMax={() => setPayAmount(payToken.amount)}
          onSelect={() => setPicker({ field: "pay" })}
        />
        <SwapField
          label={t`You receive`}
          token={selectedReceive}
          amount={estimate.receiveAmount}
          onSelect={() => setPicker({ field: "receive" })}
          readOnlyAmount
        />
        <span
          aria-hidden="true"
          className="absolute top-1/2 left-1/2 flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-background bg-foreground text-background"
        >
          <RiArrowDownLine className="size-4" />
        </span>
      </div>

      <div className="mt-3 border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-muted-foreground text-xs">
            <Trans>Rate</Trans>
          </span>
          <span className="font-mono text-xs font-semibold">
            1 {payToken.symbol} = {PLACEHOLDER_RATE.toFixed(3)} {selectedReceive?.symbol ?? "POOL"}
          </span>
        </div>
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-muted-foreground text-xs">
            <Trans>Fees</Trans>
          </span>
          <span className="font-mono text-xs font-semibold">
            <Trans>Fee calculated at confirmation</Trans>
          </span>
        </div>
      </div>

      {!isValidAmount ? (
        <p role="alert" className="mt-2 text-destructive text-xs">
          <Trans>Enter an amount greater than zero.</Trans>
        </p>
      ) : null}

      <p className="mt-2 text-muted-foreground text-xs">
        <Trans>
          Swapping in {pool.name}. Estimate uses temporary placeholder pool voucher data.
        </Trans>
      </p>

      <div className="flex-1" />

      <SignHint className="mb-2.5 bg-card" />
      <Button
        className="h-11 w-full"
        disabled={!isValidAmount || !selectedReceive}
        onClick={() => {
          if (!selectedReceive || !isValidAmount) return;
          void navigate({
            to: "/pools/$poolAddress/swap/review",
            params: { poolAddress },
            search: {
              placeholder: true,
              payAmount,
              paySymbol: payToken.symbol,
              receiveAmount: estimate.receiveAmount,
              receiveSymbol: selectedReceive.symbol,
              voucherId: selectedReceive.id,
              poolName: pool.name,
            },
          });
        }}
      >
        <Trans>Swap</Trans>
      </Button>

      <PoolTokenPickerSheet
        open={picker?.field === "pay"}
        onOpenChange={(open) => {
          if (!open) setPicker(null);
        }}
        title={t`You pay`}
        tokens={WALLET_TOKENS}
        selectedId={payToken.id}
        onSelect={setPayToken}
      />
      <PoolTokenPickerSheet
        open={picker?.field === "receive"}
        onOpenChange={(open) => {
          if (!open) setPicker(null);
        }}
        title={t`You receive`}
        tokens={receiveTokens}
        selectedId={selectedReceive?.id}
        onSelect={(token) => setReceiveTokenId(token.id)}
      />
    </div>
  );
}

function SwapField({
  label,
  token,
  amount,
  max,
  onAmountChange,
  onMax,
  onSelect,
  readOnlyAmount = false,
}: {
  label: React.ReactNode;
  token: WalletToken | undefined;
  amount: string;
  max?: string;
  onAmountChange?: (amount: string) => void;
  onMax?: () => void;
  onSelect: () => void;
  readOnlyAmount?: boolean;
}) {
  return (
    <div className="border border-border bg-card p-3.5">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-muted-foreground text-xs">{label}</span>
        {max ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onMax}
            className="font-mono text-[0.6875rem] font-semibold"
          >
            <Trans>Max {max}</Trans>
          </Button>
        ) : null}
      </div>
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={onSelect}
          className="flex h-9 shrink-0 items-center gap-1.5 border border-border bg-card px-2"
        >
          {token ? (
            <TokenLogo token={token} size={24} />
          ) : (
            <span className="size-6 rounded-full bg-muted" />
          )}
          <span className="text-sm font-bold">{token?.symbol ?? "—"}</span>
          <RiArrowDownSLine className="size-4 text-muted-foreground" aria-hidden="true" />
        </button>
        {readOnlyAmount || !onAmountChange ? (
          <output className="flex-1 truncate text-right font-heading text-[1.625rem] font-semibold leading-none tracking-tight">
            {amount}
          </output>
        ) : (
          <Input
            value={amount}
            onChange={(event) => onAmountChange(sanitizeAmount(event.target.value))}
            inputMode="decimal"
            aria-label={typeof label === "string" ? label : undefined}
            className="h-auto min-h-9 flex-1 truncate border-0 bg-transparent px-0 text-right font-heading text-[1.625rem] font-semibold leading-none tracking-tight shadow-none focus-visible:border-0"
          />
        )}
      </div>
    </div>
  );
}

function PoolTokenPickerSheet({
  open,
  onOpenChange,
  title,
  tokens,
  selectedId,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  tokens: WalletToken[];
  selectedId?: string;
  onSelect: (token: WalletToken) => void;
}) {
  return (
    <SheetRoot open={open} onOpenChange={onOpenChange}>
      <SheetPortal>
        <SheetBackdrop />
        <SheetContent className="rounded-none border-t border-border shadow-none [&>div:first-child]:hidden">
          <SheetHeader className="px-6 pt-5 pb-3">
            <SheetTitle className="font-heading text-[1.375rem] font-semibold tracking-tight">
              {title}
            </SheetTitle>
          </SheetHeader>
          <div className="max-h-[50svh] overflow-y-auto px-2 pb-2">
            {tokens.length === 0 ? (
              <p className="px-4 py-3 text-muted-foreground text-sm">
                <Trans>No tokens available.</Trans>
              </p>
            ) : (
              tokens.map((token) => {
                const selected = token.id === selectedId;
                return (
                  <button
                    key={token.id}
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-3 text-left active:bg-muted",
                      selected && "bg-muted/60",
                    )}
                    onClick={() => {
                      onSelect(token);
                      onOpenChange(false);
                    }}
                  >
                    <TokenLogo token={token} size={34} />
                    <div className="min-w-0 flex-1">
                      <p className="font-heading font-semibold text-sm tracking-tight">
                        {token.symbol}
                      </p>
                      <p className="truncate text-muted-foreground text-xs">{token.name}</p>
                    </div>
                    {selected ? (
                      <RiCheckLine className="size-5 shrink-0 text-primary" aria-hidden="true" />
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
          <SheetFooter className="px-6 pb-[max(1rem,env(safe-area-inset-bottom))]" />
        </SheetContent>
      </SheetPortal>
    </SheetRoot>
  );
}

function SwapShell({ fallbackTo, message }: { fallbackTo: string; message: string }) {
  const { t } = useLingui();
  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)]">
      <BackChevron label={t`Swap`} to={fallbackTo} />
      <p className="mt-4 text-muted-foreground text-sm">{message}</p>
    </div>
  );
}

function usePlaceholderSwapEstimate(payAmount: string) {
  return useMemo(() => {
    const value = Number(payAmount);
    const payAmountNumber = Number.isFinite(value) ? value : 0;
    const receiveAmount =
      payAmountNumber > 0 ? (payAmountNumber * PLACEHOLDER_RATE).toFixed(2) : "0.00";
    return { payAmountNumber, receiveAmount };
  }, [payAmount]);
}

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
