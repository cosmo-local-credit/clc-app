import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";

import { CatalogFilterSheet } from "#/components/catalog-filter-controls";
import { Button } from "#/components/ui/button";
import { BackendApiError } from "@clc/api/client/errors";
import type { MarketTagFacet } from "@clc/api/features/market/client";
import { FilteredCatalogTooLargeError } from "#/features/home/hooks/use-filtered-market-vouchers";
import type { MarketFilterControls } from "#/features/home/hooks/use-market-filter";
import type { CatalogFilterControls } from "#/lib/navigation/use-catalog-filter";
import { catalogSearchForScope } from "#/lib/navigation/catalog-search";

export type MarketFilterNotice = {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function useMarketFilterNotice(
  filter: CatalogFilterControls,
  error: Error | null,
  onRetry: () => void,
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
    return { message: t`Too many searches. Try again in a moment.` };
  }

  if (error instanceof BackendApiError && error.kind === "validation") {
    return {
      message: t`These filters aren't valid.`,
      actionLabel: t`Clear filters`,
      onAction: filter.clear,
    };
  }

  return { message: t`Could not load vouchers.`, actionLabel: t`Retry`, onAction: onRetry };
}

export function MarketFilterFeedback({
  filter,
  error,
  onRetry,
}: {
  filter: CatalogFilterControls;
  error: Error | null;
  onRetry: () => void;
}) {
  const notice = useMarketFilterNotice(filter, error, onRetry);
  if (!notice) return null;

  return (
    <div className="mt-4 space-y-3 border border-border bg-card p-4" role="alert">
      <p className="text-muted-foreground text-sm">{notice.message}</p>
      {notice.actionLabel && notice.onAction ? (
        <Button variant="outline" tap onClick={notice.onAction}>
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
      trigger="marketplace-icon"
      open={open}
      onOpenChange={onOpenChange}
      onApply={filter.applyFacetFilters}
    />
  );
}

export function MarketFilterSummary({ filter }: { filter: CatalogFilterControls }) {
  const { t, i18n } = useLingui();

  const summary = (() => {
    if (!filter.result.ok) {
      if (!("requested" in filter.result)) return "";
      const { requested } = filter.result;
      return i18n._("{requested, plural, one {# filter} other {# filters}}", { requested });
    }

    const { term, tags } = filter.result.filter;
    const parts: string[] = [];
    if (term !== "") parts.push(`“${term}”`);
    if (tags.length > 0) {
      parts.push(i18n._("{count, plural, one {# tag} other {# tags}}", { count: tags.length }));
    }
    return parts.join(" · ");
  })();

  if (summary === "") return null;

  return (
    <div className="pointer-events-auto flex items-center gap-1 border border-border bg-card ps-3">
      <Link
        to="/market"
        search={(previous) => ({ ...catalogSearchForScope(previous, false), scope: undefined })}
        className="min-w-0 flex-1 truncate py-2 text-sm"
        aria-label={t`Edit filters`}
      >
        {summary}
      </Link>
      <Button variant="ghost" tap className="text-muted-foreground" onClick={filter.clear}>
        <Trans>Clear</Trans>
      </Button>
    </div>
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
