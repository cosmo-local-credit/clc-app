import type { AccountActivityItem } from "@clc/api/features/accounts/client";
import { explorerTxUrl } from "@clc/core/lib/constants/chains";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { formatActivityLegAmount } from "#/components/activity/swap-activity";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { CopyableInfoValue } from "#/components/ui/copyable-info-value";
import {
  SheetBackdrop,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetPortal,
  SheetRoot,
  SheetTitle,
} from "#/components/ui/sheet";
import { EllipsizedAddress, SignedAmount } from "#/components/wallet";
import { formatTransferDate } from "#/features/wallet/logic/transfer-display";
import { CHAIN_INFO } from "#/lib/chain";

type SwapItem = Extract<AccountActivityItem, { kind: "swapped" }>;

export function AccountSwapDetailsSheet({
  activity,
  open,
  onOpenChange,
}: {
  activity: SwapItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { i18n, t } = useLingui();
  const locale = i18n.locales?.[0] ?? i18n.locale;
  const copy = (value: string) => {
    if (!navigator.clipboard) {
      toast.error(t`Couldn't copy transaction hash`);
      return;
    }
    void navigator.clipboard
      .writeText(value)
      .then(() => toast.success(t`Transaction hash copied`))
      .catch(() => toast.error(t`Couldn't copy transaction hash`));
  };

  return (
    <SheetRoot open={open} onOpenChange={onOpenChange}>
      <SheetPortal>
        <SheetBackdrop />
        <SheetContent className="max-h-[85svh] overflow-y-auto [&>div:first-child]:hidden">
          <SheetHeader className="items-center px-6 pt-5 pb-3 text-center">
            <Badge caps>
              <Trans>Swap</Trans>
            </Badge>
            <SheetTitle className="sr-only">
              <Trans>Swap</Trans>
            </SheetTitle>
          </SheetHeader>
          {activity ? (
            <div className="px-6 pb-2">
              <div className="border border-border bg-card">
                <DetailRow label={t`Status`}>
                  <Badge variant={activity.success ? "primary" : "muted"} size="sm" caps>
                    {activity.success ? t`Confirmed` : t`Failed`}
                  </Badge>
                </DetailRow>
                <DetailRow label={t`Sent`}>
                  <SignedAmount
                    direction="out"
                    amount={formatActivityLegAmount(activity.sent, locale)}
                  />
                </DetailRow>
                <DetailRow label={t`Received`}>
                  <SignedAmount
                    direction="in"
                    amount={formatActivityLegAmount(activity.received, locale)}
                  />
                </DetailRow>
                {activity.protocolFee ? (
                  <DetailRow label={t`Protocol fee`}>
                    <span className="font-mono text-xs font-semibold">
                      {formatActivityLegAmount(activity.protocolFee, locale)}
                    </span>
                  </DetailRow>
                ) : null}
                <DetailRow label={activity.poolAddresses.length > 1 ? t`Pools` : t`Pool`}>
                  <span className="space-y-1 text-end">
                    {activity.poolAddresses.map((address) => (
                      <span key={address} className="block">
                        <EllipsizedAddress address={address} />
                      </span>
                    ))}
                  </span>
                </DetailRow>
                <DetailRow label={t`Date`}>
                  <time className="font-mono text-xs font-semibold" dateTime={activity.dateBlock}>
                    {formatTransferDate(activity.dateBlock)}
                  </time>
                </DetailRow>
                <DetailRow label={t`Transaction`}>
                  <CopyableInfoValue
                    value={activity.txHash}
                    label={t`Copy transaction hash`}
                    onCopy={copy}
                  />
                </DetailRow>
              </div>
            </div>
          ) : null}
          <SheetFooter className="px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <Button asChild tap className="w-full">
              <a
                href={activity ? explorerTxUrl(CHAIN_INFO, activity.txHash) : "#"}
                target="_blank"
                rel="noreferrer"
              >
                <Trans>View on block explorer</Trans>
              </a>
            </Button>
          </SheetFooter>
        </SheetContent>
      </SheetPortal>
    </SheetRoot>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-3 py-2.5 last:border-b-0">
      <span className="shrink-0 text-muted-foreground text-xs">{label}</span>
      <span className="flex min-w-0 items-center justify-end">{children}</span>
    </div>
  );
}
