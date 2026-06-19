import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { RiArrowDownSLine, RiUser3Line } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import {
  HighlightAddress,
  HueAvatar,
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
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <BackChevron label={t`Send`} onClick={() => window.history.back()} />

      <h1 className="font-heading mb-3.5 text-[1.75rem] font-bold leading-tight">
        <Trans>Amount</Trans>
      </h1>

      {RECIPIENT ? (
        <div className="mb-2.5 flex items-center gap-2.5 border border-border bg-card p-2.5">
          <span className="text-muted-foreground text-xs">
            <Trans>To</Trans>
          </span>
          <HueAvatar
            seed={RECIPIENT.seed}
            size={24}
            icon={<RiUser3Line className="size-3" aria-hidden="true" />}
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold">{RECIPIENT.label}</p>
            {RECIPIENT.address ? (
              <HighlightAddress address={RECIPIENT.address} className="text-[0.6875rem]" />
            ) : null}
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
        className="mb-2.5 flex w-full items-center gap-2.5 border border-border bg-card p-3 text-left"
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
        <p className="font-heading text-[2.5rem] font-semibold leading-none tracking-tight">
          25.00 <span className="text-[1.25rem] text-muted-foreground">{token.symbol}</span>
        </p>
        <button
          type="button"
          className="mt-3 inline-flex border border-border px-2.5 py-1 text-[0.6875rem] font-semibold"
        >
          <Trans>Use max · {token.amount}</Trans>
        </button>
      </div>

      <div className="flex-1" />

      <SignHint className="mb-2.5" />
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
