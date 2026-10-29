import type { AccountActivityItem } from "@clc/api/features/accounts/client";
import type { ResourceKind, ResourceUsage } from "@clc/api/features/resource-limits/client";
import { formatTokenAmount } from "@clc/core/features/wallet/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";

import { SwapActivityTitle } from "#/components/activity/swap-activity";
import { Button } from "#/components/ui/button";
import { Spinner } from "#/components/ui/spinner";
import { RecipientIdentityLabel } from "#/components/wallet/recipient-identity-label";
import type { useResourceUsage } from "#/hooks/use-resource-usage";
import { cn } from "#/lib/utils";

/** The small states and rows the Wallet's sections share. */

export function Dash() {
  return (
    <span className="text-muted-foreground" dir="ltr">
      —
    </span>
  );
}

export function SectionActions({ children }: { children: ReactNode }) {
  return <div className="flex shrink-0 items-center gap-3">{children}</div>;
}

/** "1 of 3 used", muted: the phone's count, set as section meta. */
export function QuotaMeta({
  usage,
  kind,
}: {
  usage: ReturnType<typeof useResourceUsage>;
  kind: ResourceKind;
}) {
  const { i18n } = useLingui();
  const quota: ResourceUsage[ResourceKind] | undefined = usage.data?.[kind];
  if (usage.isError || !quota) return null;
  const digits = new Intl.NumberFormat(i18n.locales?.[0] ?? i18n.locale);
  const used = digits.format(quota.used);
  const limit = digits.format(quota.limit);
  return (
    <span className="text-xs whitespace-nowrap text-muted-foreground" aria-live="polite">
      {quota.unlimited ? (
        <Trans id="{used} used · Unlimited">{used} used · Unlimited</Trans>
      ) : (
        <Trans id="{used} of {limit} used">
          {used} of {limit} used
        </Trans>
      )}
    </span>
  );
}

export function Loading({ label }: { label: ReactNode }) {
  return (
    <p className="flex items-center gap-2 border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
      <Spinner />
      {label}
    </p>
  );
}

export function Empty({
  children,
  quota,
}: {
  children: ReactNode;
  quota?: ResourceUsage[ResourceKind];
}) {
  return (
    <div className="grid gap-1 border border-border bg-card px-4 py-6">
      <p className="text-sm text-muted-foreground">{children}</p>
      {quota && !quota.canCreate ? (
        <p className="text-xs text-muted-foreground">
          <Trans>Limit reached. Ask an administrator to increase your allowance.</Trans>
        </p>
      ) : null}
    </div>
  );
}

export function ErrorRetry({
  message,
  pending,
  onRetry,
}: {
  message: ReactNode;
  pending: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="grid justify-items-start gap-2 border border-border bg-card p-4">
      <p role="alert" className="text-sm text-muted-foreground">
        {message}
      </p>
      <Button type="button" variant="outline" pending={pending} onClick={onRetry}>
        <Trans>Try again</Trans>
      </Button>
    </div>
  );
}

export function ActivityTitle({ item }: { item: AccountActivityItem }) {
  if (item.kind === "swapped") {
    return <SwapActivityTitle symbols={[item.received.tokenSymbol, item.sent.tokenSymbol]} />;
  }
  if (item.kind === "creation") return <Trans>Created</Trans>;
  return <RecipientIdentityLabel address={item.counterpartyAddress} />;
}

export function ActivityAmount({ item }: { item: AccountActivityItem }) {
  const leg = item.kind === "swapped" ? item.received : item.transfer;
  const incoming = item.kind !== "sent";
  return (
    <span
      className={cn(
        "shrink-0 font-mono text-xs font-semibold",
        incoming && item.kind !== "creation" && "text-success-ink",
      )}
      dir="ltr"
    >
      {item.kind === "creation" ? "" : incoming ? "+" : "−"}
      {formatTokenAmount(leg.amount, leg.tokenDecimals)}{" "}
      <span className="text-2xs text-muted-foreground">{leg.tokenSymbol}</span>
    </span>
  );
}
