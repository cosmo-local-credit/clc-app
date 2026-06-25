import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { RiFileCopyLine } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { EllipsizedAddress, SuccessCheck, WALLET_TOKEN_BY_ID } from "#/components/wallet";
import { RECENT_RECIPIENTS } from "#/components/wallet/wallet-data";

const TX_HASH = "0x4d8ab3f71c9e052d8a7b1c6e9f0a2d3e4f5a6b7c";
const RECIPIENT = RECENT_RECIPIENTS[0];
const TO_ADDRESS = RECIPIENT?.address ?? "";

function ReceiptRow({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      {children}
    </div>
  );
}

function CopyableMono({ value }: { value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-right">
      <EllipsizedAddress address={value} />
      <span
        className="flex size-5 shrink-0 items-center justify-center bg-muted text-muted-foreground"
        aria-hidden="true"
      >
        <RiFileCopyLine className="size-3" />
      </span>
    </div>
  );
}

export function SendReceiptPage() {
  const { t } = useLingui();
  const navigate = useNavigate();
  const token = WALLET_TOKEN_BY_ID.usdc;

  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+1.75rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="flex flex-col items-center text-center">
        <SuccessCheck />
        <h1 className="font-heading mt-3.5 flex flex-col items-center gap-1 text-[1.75rem] font-bold leading-tight">
          <span>
            <Trans>Sent</Trans>
          </span>
          <span className="text-primary">25.00 {token.symbol}</span>
        </h1>
      </div>

      <div className="my-5 border border-border bg-card">
        <ReceiptRow label={t`To`}>
          <EllipsizedAddress address={TO_ADDRESS} />
        </ReceiptRow>
        <ReceiptRow label={t`Transaction`}>
          <CopyableMono value={TX_HASH} />
        </ReceiptRow>
        <ReceiptRow label={t`Network`}>
          <span className="text-xs font-semibold">Celo</span>
        </ReceiptRow>
        <div className="flex items-center justify-between gap-3 px-3 py-2.5">
          <span className="text-muted-foreground text-xs">
            <Trans>Status</Trans>
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
            <span className="size-2 rounded-full bg-primary" />
            <Trans>Confirmed</Trans>
          </span>
        </div>
      </div>

      <div className="flex-1" />

      <div className="flex gap-3">
        <Button
          className="h-11 flex-1"
          onClick={() => {
            void navigate({ to: "/" });
          }}
        >
          {t`Done`}
        </Button>
        <Button asChild className="h-11 flex-1" variant="outline">
          <a href={`https://celoscan.io/tx/${TX_HASH}`} rel="noopener noreferrer" target="_blank">
            Celoscan
          </a>
        </Button>
      </div>
    </div>
  );
}
