import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { RiArrowDownSLine } from "react-icons/ri";
import { useAccount } from "wagmi";

import { Button } from "#/components/ui/button";
import { EllipsizedAddress, SignHint, TokenLogo } from "#/components/wallet";
import { RECENT_RECIPIENTS } from "#/components/wallet/wallet-data";
import { BackChevron } from "#/components/wallet/wallet-kit";
import { useAccountTokensInfinite } from "#/features/wallet/hooks/use-account-balances";
import { accountTokenToWalletToken } from "#/features/wallet/logic/account-token-display";
import { cn } from "#/lib/utils";
import { TokenPickerSheet } from "./token-picker-sheet";

const RECIPIENT = RECENT_RECIPIENTS[0];

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

export function SendAmountPage({ token }: { token?: string }) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const { address } = useAccount();
  const tokensQuery = useAccountTokensInfinite(address);
  const tokens =
    tokensQuery.data?.pages.flatMap((page) => page.tokens.map(accountTokenToWalletToken)) ?? [];

  // Preselect the token passed from the token detail page; fall back to the
  // first token once balances load. `selectedId` mirrors the fetched token id
  // (the lowercased contract address).
  const [selectedId, setSelectedId] = useState<string | undefined>(token?.toLowerCase());
  const selectedToken = tokens.find((item) => item.id === selectedId) ?? tokens[0];
  // Preserve the current token selection when editing the recipient.
  const tokenParam = selectedToken?.contractAddress ?? selectedToken?.id ?? token;

  const [amount, setAmount] = useState("25.00");
  const [pickerOpen, setPickerOpen] = useState(false);

  // Balances are pre-formatted without grouping separators; parse defensively.
  const maxAmount = selectedToken ? Number(selectedToken.amount.replace(/,/g, "")) : 0;
  const amountValue = Number(amount);
  const isValidAmount = amount.trim() !== "" && Number.isFinite(amountValue) && amountValue > 0;
  const exceedsMax = isValidAmount && amountValue > maxAmount;
  const canSend = !!selectedToken && isValidAmount && !exceedsMax;

  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <BackChevron label={t`Send`} to="/" />

      <h1 className="font-heading mb-3.5 text-[1.75rem] font-bold leading-tight">
        <Trans>Amount</Trans>
      </h1>

      {RECIPIENT ? (
        <div className="mb-2.5 flex h-12 items-center gap-2.5 border border-border bg-card px-3">
          <span className="shrink-0 text-muted-foreground text-xs">
            <Trans>To</Trans>
          </span>
          <div className="min-w-0 flex-1">
            {RECIPIENT.address ? <EllipsizedAddress address={RECIPIENT.address} /> : null}
          </div>
          <button
            type="button"
            className="font-semibold text-primary text-xs hover:underline"
            onClick={() => {
              void navigate({ to: "/wallet/send", search: { token: tokenParam } });
            }}
          >
            <Trans>Edit</Trans>
          </button>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        disabled={!selectedToken}
        className="mb-2.5 flex h-11 w-full items-center gap-2.5 border border-border bg-card px-3 text-left disabled:opacity-60"
      >
        {selectedToken ? (
          <>
            <TokenLogo token={selectedToken} size={30} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">{selectedToken.symbol}</p>
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
              ) : tokensQuery.isSuccess ? (
                <Trans>No tokens available</Trans>
              ) : (
                <Trans>Loading tokens…</Trans>
              )}
            </p>
          </div>
        )}
        <RiArrowDownSLine className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>

      <div className="mb-2.5 flex flex-col items-center border border-border bg-card px-4 py-5">
        <div className="flex items-baseline justify-center gap-1.5">
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(sanitizeAmount(event.target.value))}
            // field-sizing sizes the input to its text exactly, so the
            // number + symbol pair centers true. size is the pre-support fallback.
            size={Math.max(amount.length, 1)}
            aria-label={t`Amount`}
            aria-invalid={exceedsMax}
            className={cn(
              "min-w-0 bg-transparent text-center font-heading text-[2.5rem] font-semibold leading-none tracking-tight outline-none [field-sizing:content]",
              exceedsMax && "text-destructive",
            )}
          />
          <span className="text-[1.25rem] text-muted-foreground">{selectedToken?.symbol}</span>
        </div>
        {selectedToken ? (
          <Button
            variant="secondary"
            size="sm"
            className="mt-3 h-8"
            onClick={() => setAmount(selectedToken.amount.replace(/,/g, ""))}
          >
            <Trans>Use max · {selectedToken.amount}</Trans>
          </Button>
        ) : null}
        {exceedsMax ? (
          <p className="mt-2 text-destructive text-xs">
            <Trans>Amount exceeds your balance</Trans>
          </p>
        ) : null}
      </div>

      <div className="flex-1" />

      <SignHint className="mb-2.5 bg-card" />
      <Button
        className="h-11 w-full"
        disabled={!canSend}
        onClick={() => {
          void navigate({ to: "/wallet/send/receipt" });
        }}
      >
        {t`Send`}
      </Button>

      <TokenPickerSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        tokens={tokens}
        selectedId={selectedToken?.id}
        onSelect={(next) => setSelectedId(next.id)}
      />
    </div>
  );
}
