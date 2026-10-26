import { Trans, useLingui } from "@lingui/react/macro";

import { CatalogFilterSheet } from "#/components/catalog-filter-controls";
import { Button } from "#/components/ui/button";
import { BackendApiError } from "@clc/api/client/errors";
import type { MarketTagFacet } from "@clc/api/features/market/client";
import { FilteredCatalogTooLargeError } from "#/features/home/hooks/use-filtered-market-vouchers";
import type { MarketFilterControls } from "#/features/home/hooks/use-market-filter";
import type { CatalogFilterControls } from "#/lib/navigation/use-catalog-filter";

export type MarketFilterNotice = {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /** The action is under way: a retry that is loading again. */
  actionPending?: boolean;
};

export function useMarketFilterNotice(
  filter: CatalogFilterControls,
  error: Error | null,
  onRetry: () => void,
  retrying: boolean,
  fallbackMessage?: string,
): MarketFilterNotice | null {
  const { t } = useLingui();

  if (!filter.result.ok) {
    if (!("requested" in filter.result)) return null;
    return {
      message: t`This link has too many filters (${filter.result.requested}, maximum ${filter.result.max}).`,
      actionLabel: t`Clear filters`,
      onAction: filter.clear,
    };
  }

  if (!error) return null;

  if (error instanceof FilteredCatalogTooLargeError) {
    return {
      message: t`Too many matches to show. Try a more specific search.`,
      actionLabel: t`Clear filters`,
      onAction: filter.clear,
    };
  }

  if (error instanceof BackendApiError && error.kind === "rate-limited") {
    return {
      message: t`Too many searches. Try again in a moment.`,
      actionLabel: t`Retry`,
      onAction: onRetry,
      actionPending: retrying,
    };
  }

  if (error instanceof BackendApiError && error.kind === "validation") {
    return {
      message: t`These filters aren't valid.`,
      actionLabel: t`Clear filters`,
      onAction: filter.clear,
    };
  }

  return {
    message: fallbackMessage ?? t`Could not load vouchers.`,
    actionLabel: t`Retry`,
    onAction: onRetry,
    actionPending: retrying,
  };
}

export function MarketFilterFeedback({
  filter,
  error,
  onRetry,
  retrying,
}: {
  filter: CatalogFilterControls;
  error: Error | null;
  onRetry: () => void;
  retrying: boolean;
}) {
  const notice = useMarketFilterNotice(filter, error, onRetry, retrying);
  if (!notice) return null;

  return (
    <div className="mt-4 space-y-3 border border-border bg-card p-4" role="alert">
      <p className="text-muted-foreground text-sm">{notice.message}</p>
      {notice.actionLabel && notice.onAction ? (
        <Button variant="outline" tap pending={notice.actionPending} onClick={notice.onAction}>
          {notice.actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

export function MarketFilterSheet({
  filter,
  facets,
  open,
  onOpenChange,
}: {
  filter: MarketFilterControls;
  facets: MarketTagFacet[];
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  return (
    <CatalogFilterSheet
      filter={filter}
      facets={facets}
      title={<Trans>Filter vouchers</Trans>}
      facetTitle={<Trans>What they offer</Trans>}
      showHeader={false}
      trigger="bar"
      open={open}
      onOpenChange={onOpenChange}
      onApply={filter.applyFacetFilters}
    />
  );
}

export function MarketFilteredEmpty({ onClear }: { onClear: () => void }) {
  return (
    <div className="mt-4 space-y-3 border border-border bg-card p-4">
      <p className="text-muted-foreground text-sm">
        <Trans>No vouchers match this search.</Trans>
      </p>
      <Button variant="outline" tap onClick={onClear}>
        <Trans>Clear filters</Trans>
      </Button>
    </div>
  );
}
