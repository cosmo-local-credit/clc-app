import { Trans, useLingui } from "@lingui/react/macro";

import { CatalogFilterSheet } from "#/components/catalog-filter-controls";
import { Button } from "#/components/ui/button";
import { BackendApiError } from "@clc/api/client/errors";
import type { PoolTagFacet } from "@clc/api/features/pools/client";
import { FilteredPoolsTooLargeError } from "#/features/pools/hooks/use-filtered-pools";
import type { PersistedCatalogFilterControls } from "#/lib/navigation/use-persisted-catalog-filter";

export function PoolFilterSheet({
  filter,
  facets,
  open,
  onOpenChange,
}: {
  filter: PersistedCatalogFilterControls;
  facets: PoolTagFacet[];
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  return (
    <CatalogFilterSheet
      filter={filter}
      facets={facets}
      title={<Trans>Filter pools</Trans>}
      facetTitle={<Trans>Categories</Trans>}
      showHeader={false}
      trigger="bar"
      open={open}
      onOpenChange={onOpenChange}
      onApply={filter.applyFacetFilters}
    />
  );
}

export function PoolFilterFeedback({
  filter,
  error,
  onRetry,
  retrying,
}: {
  filter: PersistedCatalogFilterControls;
  error: Error | null;
  onRetry: () => void;
  retrying: boolean;
}) {
  const { t } = useLingui();

  const notice = (() => {
    if (!filter.result.ok) {
      return {
        message:
          filter.result.reason === "invalid-vouchers" || filter.result.reason === "invalid-pools"
            ? t`This link contains an invalid resource filter.`
            : t`This link has too many filters (${filter.result.requested}, maximum ${filter.result.max}).`,
        actionLabel: t`Clear filters`,
        onAction: filter.clear,
      };
    }
    if (!error) return null;

    if (error instanceof FilteredPoolsTooLargeError) {
      return {
        message: t`Too many matches to show. Try a more specific search.`,
        actionLabel: t`Clear filters`,
        onAction: filter.clear,
      };
    }
    if (error instanceof BackendApiError && error.kind === "rate-limited") {
      return { message: t`Too many searches. Try again in a moment.` };
    }

    if (error instanceof BackendApiError && error.kind === "validation") {
      return {
        message: t`These filters aren't valid.`,
        actionLabel: t`Clear filters`,
        onAction: filter.clear,
      };
    }

    return {
      message: t`Couldn't load pools.`,
      actionLabel: t`Try again`,
      onAction: onRetry,
      actionPending: retrying,
    };
  })();

  if (!notice) return null;

  return (
    <div className="space-y-2 border border-border bg-card p-3" role="alert">
      <p className="text-muted-foreground text-sm">{notice.message}</p>
      {notice.actionLabel && notice.onAction ? (
        <Button
          variant="outline"
          tap
          pending={"actionPending" in notice && notice.actionPending}
          onClick={notice.onAction}
        >
          {notice.actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
