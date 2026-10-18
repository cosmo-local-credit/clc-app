import type {
  ResourceKind,
  ResourceUsage as ResourceUsageData,
} from "@clc/api/features/resource-limits/client";
import { Trans as RuntimeTrans } from "@lingui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { Button } from "#/components/ui/button";
import { useResourceUsage } from "#/hooks/use-resource-usage";
import { cn } from "#/lib/utils";

type ResourceQuota = ResourceUsageData[ResourceKind];

/** Compact quota copy for a section heading whose title already names the resource. */
function ResourceQuotaSummary({
  quota,
  pending,
  error,
  className,
}: {
  quota: ResourceQuota | undefined;
  pending: boolean;
  error: boolean;
  className?: string;
}) {
  const used = quota?.used ?? 0;
  const limit = quota?.limit ?? 0;
  return (
    <span
      className={cn(
        "font-sans text-muted-foreground text-sm font-normal tracking-normal",
        className,
      )}
      aria-live="polite"
    >
      {error ? (
        <Trans>Unavailable</Trans>
      ) : pending || !quota ? (
        <Trans>Loading…</Trans>
      ) : quota.unlimited ? (
        <RuntimeTrans id="{used} used · Unlimited" values={{ used }} />
      ) : (
        <RuntimeTrans id="{used} of {limit} used" values={{ used, limit }} />
      )}
    </span>
  );
}

export function ResourceQuotaTitle({
  children,
  quota,
  pending,
  error,
}: {
  children: ReactNode;
  quota: ResourceQuota | undefined;
  pending: boolean;
  error: boolean;
}) {
  return (
    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span>{children}</span> <ResourceQuotaSummary quota={quota} pending={pending} error={error} />
    </span>
  );
}

export function ResourceLimitMessage({ quota }: { quota: ResourceQuota | undefined }) {
  return quota && !quota.canCreate ? (
    <p className="text-muted-foreground text-sm">
      <Trans>Limit reached. Ask an administrator to increase your allowance.</Trans>
    </p>
  ) : null;
}

/**
 * The creator's allowance for one kind of resource. `count={false}` drops the
 * "n of m used" line and speaks only when something blocks creation: a failed
 * load, or the limit reached.
 */
export function ResourceUsage({
  resource,
  count = true,
}: {
  resource: ResourceKind;
  count?: boolean;
}) {
  const query = useResourceUsage();
  const { t } = useLingui();
  const label = {
    vouchers: t`Vouchers`,
    catalogs: t`Catalogs`,
    offers: t`Offers`,
    pools: t`Pools`,
  }[resource];
  const quota = query.data?.[resource];
  if (query.isError)
    return (
      <div role="alert" className="space-y-2 text-sm">
        <p>
          <Trans>Couldn't load resource limits.</Trans>
        </p>
        <Button
          variant="outline"
          tap
          pending={query.isFetching}
          onClick={() => void query.refetch()}
        >
          <Trans>Retry</Trans>
        </Button>
      </div>
    );
  if (!quota)
    return count ? (
      <p role="status" className="text-sm">
        <Trans>Loading…</Trans>
      </p>
    ) : null;
  const { used, limit } = quota;
  return (
    <div className="space-y-1 text-sm text-muted-foreground empty:hidden" aria-live="polite">
      {count ? (
        <p>
          {label}:{" "}
          {quota.unlimited ? (
            <Trans id="{used} used · Unlimited">{used} used · Unlimited</Trans>
          ) : (
            <Trans id="{used} of {limit} used">
              {used} of {limit} used
            </Trans>
          )}
        </p>
      ) : null}
      {!quota.canCreate && (
        <p>
          <Trans>Limit reached. Ask an administrator to increase your allowance.</Trans>
        </p>
      )}
    </div>
  );
}
