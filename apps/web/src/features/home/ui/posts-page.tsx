import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useRef, useState } from "react";

import { CatalogSearchField } from "#/components/catalog-filter-controls";
import { ReportList } from "#/components/reports/report-list";
import { Button } from "#/components/ui/button";
import { useReportFeed } from "#/features/home/hooks/use-filtered-reports";
import { useReportsInfinite } from "#/features/home/hooks/use-reports";
import { CATALOG_FILTER_PREFERENCE_KEYS } from "#/lib/navigation/catalog-filter-preference-storage";
import { usePersistedCatalogFilter } from "#/lib/navigation/use-persisted-catalog-filter";
import { ReportFilterFeedback, ReportFilterSheet } from "./report-filter-ui";

export function PostsPage() {
  const { t, i18n } = useLingui();
  const filter = usePersistedCatalogFilter(CATALOG_FILTER_PREFERENCE_KEYS.posts, {
    voucherRelationships: true,
  });
  const reportsQuery = useReportsInfinite(
    undefined,
    !filter.isFiltered && !filter.isRestoringPreference,
  );
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Latched rather than tracking `filtersOpen`, so reopening the sheet reuses the cached vocabulary
  // instead of flashing an empty facet list on every open.
  const [filtersEverOpened, setFiltersEverOpened] = useState(false);

  const feed = useReportFeed(
    filter,
    {
      reports: reportsQuery.data?.pages.flatMap((page) => page.reports) ?? [],
      isPending: reportsQuery.isPending,
      error: reportsQuery.error ?? null,
      retry: () => void reportsQuery.refetch(),
      hasNextPage: reportsQuery.hasNextPage,
      fetchNextPage: () => void reportsQuery.fetchNextPage(),
      isFetchingNextPage: reportsQuery.isFetchingNextPage,
    },
    filtersEverOpened,
  );
  const reports = feed.reports;
  const resultCountLabel = i18n._("{count, plural, one {# post} other {# posts}}", {
    count: reports.length,
  });
  const isRefining = feed.status === "refining" || filter.isDebouncing;

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !feed.hasMore || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !feed.isLoadingMore) {
        feed.loadMore();
      }
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [feed.hasMore, feed.isLoadingMore, feed.loadMore]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <h1 className="min-w-0 font-heading text-[1.75rem] font-bold leading-tight">
          <Trans>Posts</Trans>
        </h1>
        <ReportFilterSheet
          filter={filter}
          facets={feed.tagFacets}
          voucherFacets={feed.voucherFacets}
          open={filtersOpen}
          onOpenChange={(next) => {
            if (next) setFiltersEverOpened(true);
            setFiltersOpen(next);
          }}
        />
      </div>

      <CatalogSearchField filter={filter} label={t`Search posts by title or description`} />

      <ReportFilterFeedback filter={filter} error={feed.error} onRetry={feed.retry} />

      {feed.status === "loading" ? (
        <div className="border border-border bg-card p-4 text-muted-foreground text-sm">
          <Trans>Loading posts…</Trans>
        </div>
      ) : null}

      {feed.status === "ready" && filter.result.ok ? (
        <>
          <p className="font-medium text-sm tabular-nums">{resultCountLabel}</p>
          {reports.length === 0 ? (
            <div className="space-y-3 border border-border bg-card p-4">
              <p className="text-muted-foreground text-sm">
                {filter.isFiltered ? (
                  <Trans>No posts match this search.</Trans>
                ) : (
                  <Trans>No posts yet.</Trans>
                )}
              </p>
              {filter.isFiltered ? (
                <Button variant="outline" size="sm" className="h-9 bg-card" onClick={filter.clear}>
                  <Trans>Clear filters</Trans>
                </Button>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}

      {reports.length > 0 ? (
        <ReportList reports={reports} ariaLabel={t`Field reports`} busy={isRefining} />
      ) : null}

      <div ref={loadMoreRef} className="h-px" aria-hidden="true" />
      {feed.isLoadingMore ? (
        <p className="text-center text-muted-foreground text-xs">
          <Trans>Loading more…</Trans>
        </p>
      ) : null}
    </div>
  );
}
