import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { RiArrowDownLine } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { SignHint, TokenLogo, WALLET_TOKENS, type WalletToken } from "#/components/wallet";
import { BackChevron } from "#/components/wallet/wallet-kit";
import type { PoolVoucherPlaceholder } from "#/features/pools/data/placeholder-pool-vouchers";
import { usePoolVouchers } from "#/features/pools/hooks/use-pool-vouchers";
import { useUserPoolByAddress } from "#/features/pools/hooks/use-user-pools";

const PLACEHOLDER_RATE = 0.994;

export function PoolSwapPage({ poolAddress }: { poolAddress: string }) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const poolQuery = useUserPoolByAddress(poolAddress);
  const pool = poolQuery.data;
  const vouchers = usePoolVouchers(pool);
  const [payAmount, setPayAmount] = useState("25.00");
  const payToken = WALLET_TOKENS.find((token) => token.id === "usdc") ?? WALLET_TOKENS[0];
  const receiveVoucher = vouchers[0];
  const estimate = usePlaceholderSwapEstimate(payAmount);
  const isValidAmount = estimate.payAmountNumber > 0;

  if (poolQuery.isLoading) return <SwapShell title={t`Swap`} message={t`Loading pool…`} />;
  if (poolQuery.isError) return <SwapShell title={t`Swap`} message={t`Couldn't load this pool.`} />;
  if (!pool) return <SwapShell title={t`Swap`} message={t`Pool not found.`} />;

  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <BackChevron label={pool.name} to="/" search={{ tab: "pool" }} />
      <h1 className="font-heading mb-3.5 text-[1.75rem] font-bold leading-tight">
        <Trans>Swap</Trans>
      </h1>

      <div className="mb-2.5 border border-border bg-card px-3 py-2.5">
        <p className="text-muted-foreground text-xs">
          <Trans>Selected pool</Trans>
        </p>
        <p className="mt-0.5 font-semibold text-sm">{pool.name}</p>
      </div>

      <div className="relative flex flex-col gap-1">
        <SwapField
          ariaLabel={t`You give amount`}
          label={t`You give`}
          token={payToken}
          amount={payAmount}
          onAmountChange={setPayAmount}
        />
        <ReceiveField
          ariaLabel={t`You receive amount`}
          voucher={receiveVoucher}
          amount={estimate.receiveAmount}
        />
        <span
          aria-hidden="true"
          className="absolute top-1/2 left-1/2 flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-background bg-foreground text-background"
        >
          <RiArrowDownLine className="size-4" />
        </span>
      </div>

      <p className="mt-2 text-muted-foreground text-xs">
        <Trans>
          Estimate uses temporary placeholder pool voucher data. No quote or relay request is made.
        </Trans>
      </p>

      <div className="mt-3 border border-border bg-card">
        <SummaryRow
          label={t`Rate`}
          value={`1 ${payToken.symbol} = ${PLACEHOLDER_RATE.toFixed(3)} ${receiveVoucher?.symbol ?? "POOL"}`}
        />
        <SummaryRow label={t`Fees`} value={t`Fee calculated at confirmation`} last />
      </div>
      {!isValidAmount ? (
        <p role="alert" className="mt-2 text-destructive text-xs">
          <Trans>Enter an amount greater than zero.</Trans>
        </p>
      ) : null}

      <div className="flex-1" />
      <SignHint className="mb-2.5 bg-card" />
      <Button
        className="h-11 w-full"
        disabled={!isValidAmount || !receiveVoucher}
        onClick={() => {
          if (!receiveVoucher || !isValidAmount) return;
          void navigate({
            to: "/pools/$poolAddress/swap/review",
            params: { poolAddress },
            search: {
              placeholder: true,
              payAmount,
              paySymbol: payToken.symbol,
              receiveAmount: estimate.receiveAmount,
              receiveSymbol: receiveVoucher.symbol,
              voucherId: receiveVoucher.id,
              poolName: pool.name,
            },
          });
        }}
      >
        <Trans>Review swap</Trans>
      </Button>
    </div>
  );
}

function SwapField({
  ariaLabel,
  label,
  token,
  amount,
  onAmountChange,
}: {
  ariaLabel: string;
  label: React.ReactNode;
  token: WalletToken;
  amount: string;
  onAmountChange: (amount: string) => void;
}) {
  return (
    <div className="border border-border bg-card p-3.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <div className="mt-2 flex items-center gap-2.5">
        <div className="flex h-9 shrink-0 items-center gap-1.5 border border-border bg-card px-2">
          <TokenLogo token={token} size={24} />
          <span className="text-sm font-bold">{token.symbol}</span>
        </div>
        <Input
          value={amount}
          onChange={(event) => onAmountChange(sanitizeAmount(event.target.value))}
          inputMode="decimal"
          aria-label={ariaLabel}
          className="h-auto min-h-9 flex-1 border-0 bg-transparent px-0 text-right font-heading text-[1.625rem] font-semibold leading-none tracking-tight shadow-none focus-visible:border-0"
        />
      </div>
    </div>
  );
}

function ReceiveField({
  ariaLabel,
  voucher,
  amount,
}: {
  ariaLabel: string;
  voucher: PoolVoucherPlaceholder | undefined;
  amount: string;
}) {
  return (
    <div className="border border-border bg-card p-3.5">
      <span className="text-muted-foreground text-xs">
        <Trans>You receive</Trans>
      </span>
      <div className="mt-2 flex items-center gap-2.5">
        <div className="flex h-9 shrink-0 items-center gap-1.5 border border-border bg-card px-2">
          <span className="flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-[0.625rem] font-bold">
            {voucher?.symbol.slice(0, 2) ?? "--"}
          </span>
          <span className="text-sm font-bold">{voucher?.symbol ?? "POOL"}</span>
        </div>
        <output
          aria-label={ariaLabel}
          className="flex-1 text-right font-heading text-[1.625rem] font-semibold leading-none tracking-tight"
        >
          {amount}
        </output>
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  last = false,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 px-3 py-2 ${last ? "" : "border-b border-border"}`}
    >
      <span className="shrink-0 text-muted-foreground text-xs">{label}</span>
      <span className="min-w-0 break-words text-right font-mono text-xs font-semibold">
        {value}
      </span>
    </div>
  );
}

function SwapShell({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)]">
      <BackChevron label={title} to="/" search={{ tab: "pool" }} />
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
  const [whole, ...rest] = cleaned.split(".");
  return rest.length ? `${whole}.${rest.join("").slice(0, 2)}` : whole;
}
