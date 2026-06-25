import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { RiArrowDownSLine } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import {
  EllipsizedAddress,
  SignHint,
  TokenLogo,
  WALLET_TOKENS,
  type WalletToken,
} from "#/components/wallet";
import { RECENT_RECIPIENTS } from "#/components/wallet/wallet-data";
import { BackChevron } from "#/components/wallet/wallet-kit";
import { TokenPickerSheet } from "./token-picker-sheet";

const RECIPIENT = RECENT_RECIPIENTS[0];

export function SendAmountPage() {
  const { t } = useLingui();
  const navigate = useNavigate();
  const [token, setToken] = useState<WalletToken>(WALLET_TOKENS[0]);
  const [amount, setAmount] = useState("25.00");
  const [pickerOpen, setPickerOpen] = useState(false);

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
              void navigate({ to: "/wallet/send" });
            }}
          >
            <Trans>Edit</Trans>
          </button>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        className="mb-2.5 flex h-11 w-full items-center gap-2.5 border border-border bg-card px-3 text-left"
      >
        <TokenLogo token={token} size={30} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">{token.symbol}</p>
          <p className="text-muted-foreground text-xs">
            <Trans>Balance {token.amount}</Trans>
          </p>
        </div>
        <RiArrowDownSLine className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>

      <div className="mb-2.5 border border-border bg-card px-4 py-5 text-center">
        <p className="min-w-0 truncate font-heading text-[2.5rem] font-semibold leading-none tracking-tight">
          {amount} <span className="text-[1.25rem] text-muted-foreground">{token.symbol}</span>
        </p>
        <Button
          variant="secondary"
          size="sm"
          className="mt-3 h-8"
          onClick={() => setAmount(token.amount)}
        >
          <Trans>Use max · {token.amount}</Trans>
        </Button>
      </div>

      <div className="flex-1" />

      <SignHint className="mb-2.5 bg-card" />
      <Button
        className="h-11 w-full"
        onClick={() => {
          void navigate({ to: "/wallet/send/receipt" });
        }}
      >
        {t`Send`}
      </Button>

      <TokenPickerSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        tokens={WALLET_TOKENS}
        selectedId={token.id}
        onSelect={setToken}
      />
    </div>
  );
}
