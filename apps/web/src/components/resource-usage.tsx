import type { ResourceKind } from "@clc/api/features/resource-limits/client";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "#/components/ui/button";
import { useResourceUsage } from "#/hooks/use-resource-usage";

export function ResourceUsage({ resource }: { resource: ResourceKind }) {
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
    return (
      <p role="status" className="text-sm">
        <Trans>Loading…</Trans>
      </p>
    );
  const { used, limit } = quota;
  return (
    <div className="space-y-1 text-sm text-muted-foreground" aria-live="polite">
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
      {!quota.canCreate && (
        <p>
          <Trans>Limit reached. Ask an administrator to increase your allowance.</Trans>
        </p>
      )}
    </div>
  );
}
