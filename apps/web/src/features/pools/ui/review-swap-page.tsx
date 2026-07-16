import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "#/components/ui/button";
import { SignHint } from "#/components/wallet";
import { BackChevron } from "#/components/wallet/wallet-kit";

export type ReviewSwapSearch = {
  placeholder?: boolean;
  payAmount?: string;
  paySymbol?: string;
  receiveAmount?: string;
  receiveSymbol?: string;
  voucherId?: string;
  poolName?: string;
};

const REQUIRED_REVIEW_FIELDS = [
  "payAmount",
  "paySymbol",
  "receiveAmount",
  "receiveSymbol",
  "voucherId",
] as const;

export function ReviewSwapPage({
  poolAddress,
  details,
}: {
  poolAddress: string;
  details: ReviewSwapSearch;
}) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const [processing, setProcessing] = useState(false);
  const missing = getMissingDetails(details);

  if (missing.length > 0) {
    return (
      <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <BackChevron label={t`Swap`} to="/" search={{ tab: "pool" }} />
        <h1 className="font-heading mb-3.5 text-[1.75rem] font-bold leading-tight">
          <Trans>Review swap</Trans>
        </h1>
        <p role="alert" className="text-muted-foreground text-sm">
          <Trans>Swap details are missing. Start again to review a placeholder swap.</Trans>
        </p>
        <div className="flex-1" />
        <Button
          className="h-11 w-full"
          onClick={() => void navigate({ to: "/pools/$poolAddress/swap", params: { poolAddress } })}
        >
          <Trans>Back to swap</Trans>
        </Button>
      </div>
    );
  }

  const payLabel = `${details.payAmount} ${details.paySymbol}`;
  const receiveLabel = `${details.receiveAmount} ${details.receiveSymbol}`;

  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <BackChevron label={t`Swap`} to="/" search={{ tab: "pool" }} />
      <h1 className="font-heading mb-3.5 text-[1.75rem] font-bold leading-tight">
        <Trans>Review swap</Trans>
      </h1>
      <div className="border border-border bg-card">
        <ReviewRow label={t`You give`} value={payLabel} />
        <ReviewRow label={t`You receive`} value={receiveLabel} />
        <ReviewRow label={t`Pool`} value={details.poolName ?? poolAddress} last />
      </div>
      <p className="mt-3 text-muted-foreground text-xs">
        <Trans>
          This confirmation is a placeholder integration step. It will not submit a relay
          transaction until real pool quote data is available.
        </Trans>
      </p>
      {details.placeholder ? null : (
        <p role="alert" className="mt-2 text-destructive text-xs">
          <Trans>Real swap submission is not enabled for these details.</Trans>
        </p>
      )}
      <div className="flex-1" />
      <SignHint className="mb-2.5 bg-card" />
      <Button
        className="h-11 w-full"
        disabled={processing || !details.placeholder}
        onClick={() => {
          if (!details.placeholder) return;
          setProcessing(true);
          void navigate({
            to: "/pools/$poolAddress/swap/receipt",
            params: { poolAddress },
            search: {
              placeholder: true,
              receiveAmount: details.receiveAmount,
              receiveSymbol: details.receiveSymbol,
              poolName: details.poolName,
              submittedAt: new Date().toISOString(),
            },
          });
        }}
      >
        {processing ? <Trans>Confirming…</Trans> : <Trans>Confirm swap</Trans>}
      </Button>
    </div>
  );
}

function ReviewRow({
  label,
  value,
  last = false,
}: {
  label: React.ReactNode;
  value: string;
  last?: boolean;
}) {
  return (
    <div
      className={`flex min-h-11 items-center justify-between gap-3 px-3 py-2.5 ${last ? "" : "border-b border-border"}`}
    >
      <span className="shrink-0 text-muted-foreground text-xs">{label}</span>
      <span className="min-w-0 break-words text-right font-mono text-xs font-semibold">
        {value}
      </span>
    </div>
  );
}

function getMissingDetails(details: ReviewSwapSearch): string[] {
  return REQUIRED_REVIEW_FIELDS.filter((key) => !details[key]);
}
