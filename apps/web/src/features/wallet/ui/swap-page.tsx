import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { RiArrowDownLine, RiArrowDownSLine, RiInformationLine } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { SignHint, TokenLogo, WALLET_TOKENS, type WalletToken } from "#/components/wallet";
import { BackChevron } from "#/components/wallet/wallet-kit";
import { cn } from "#/lib/utils";
import { TokenPickerSheet } from "./token-picker-sheet";

const ROUTE_HOPS = ["USDC", "Solar Coop pool", "BABAS"] as const;

function SwapField({
  label,
  token,
  amount,
  balance,
  onSelect,
}: {
  label: React.ReactNode;
  token: WalletToken;
  amount: string;
  balance?: string;
  onSelect: () => void;
}) {
  return (
    <div className="border border-border bg-card p-3.5">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-muted-foreground text-xs">{label}</span>
        {balance ? (
          <span className="font-mono text-muted-foreground text-[0.6875rem]">
            <Trans>Balance {balance}</Trans>
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={onSelect}
          className="flex shrink-0 items-center gap-1.5 border border-border bg-background px-2 py-1.5"
        >
          <TokenLogo token={token} size={24} />
          <span className="text-sm font-bold">{token.symbol}</span>
          <RiArrowDownSLine className="size-4 text-muted-foreground" aria-hidden="true" />
        </button>
        <p className="min-w-0 flex-1 overflow-hidden truncate text-right font-heading text-[1.625rem] font-semibold tracking-tight">
          {amount}
        </p>
      </div>
    </div>
  );
}

export function SwapPage() {
  const { t } = useLingui();
  const [payToken, setPayToken] = useState<WalletToken>(WALLET_TOKENS[0]);
  const [receiveToken, setReceiveToken] = useState<WalletToken>(
    WALLET_TOKENS.find((token) => token.id === "babas") ?? WALLET_TOKENS[0],
  );
  const [picker, setPicker] = useState<null | { field: "pay" | "receive" }>(null);

  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <BackChevron label={t`Swap`} onClick={() => window.history.back()} />

      <h1 className="font-heading mb-3.5 text-[1.75rem] font-bold leading-tight">
        <Trans>Swap</Trans>
      </h1>

      <div className="relative flex flex-col gap-1">
        <SwapField
          label={t`You pay`}
          token={payToken}
          amount="25.00"
          balance="245.00"
          onSelect={() => setPicker({ field: "pay" })}
        />
        <SwapField
          label={t`You receive`}
          token={receiveToken}
          amount="24.85"
          onSelect={() => setPicker({ field: "receive" })}
        />
        <span
          aria-hidden="true"
          className="absolute top-1/2 left-1/2 flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-background bg-foreground text-background"
        >
          <RiArrowDownLine className="size-4" />
        </span>
      </div>

      <div className="my-3 border border-primary/30 bg-primary/5 p-3">
        <div className="mb-2 flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-primary" />
          <span className="text-xs font-bold">
            <Trans>Best route · auto-selected</Trans>
          </span>
          <RiInformationLine
            className="ml-auto size-3.5 text-muted-foreground"
            aria-hidden="true"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {ROUTE_HOPS.map((hop, index) => (
            <div key={hop} className="flex items-center gap-1.5">
              <span
                className={cn(
                  "border border-border bg-card px-1.5 py-0.5 text-[0.6875rem] font-semibold",
                  index === 1 ? "font-heading text-muted-foreground" : "font-mono text-foreground",
                )}
              >
                {hop}
              </span>
              {index < ROUTE_HOPS.length - 1 ? (
                <span className="text-muted-foreground text-xs">→</span>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className="border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-muted-foreground text-xs">
            <Trans>Rate</Trans>
          </span>
          <span className="font-mono text-xs font-semibold">1 USDC = 0.994 BABAS</span>
        </div>
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-muted-foreground text-xs">
            <Trans>Fees</Trans>
          </span>
          <span className="font-mono text-xs font-semibold">0.015 BABAS</span>
        </div>
      </div>

      <div className="flex-1" />

      <SignHint className="mb-2.5" />
      <Button className="h-11 w-full">
        <Trans>Swap</Trans>
      </Button>

      <TokenPickerSheet
        open={picker?.field === "pay"}
        onOpenChange={(open) => {
          if (!open) setPicker(null);
        }}
        tokens={WALLET_TOKENS}
        selectedId={payToken.id}
        onSelect={setPayToken}
      />
      <TokenPickerSheet
        open={picker?.field === "receive"}
        onOpenChange={(open) => {
          if (!open) setPicker(null);
        }}
        tokens={WALLET_TOKENS}
        selectedId={receiveToken.id}
        onSelect={setReceiveToken}
      />
    </div>
  );
}
