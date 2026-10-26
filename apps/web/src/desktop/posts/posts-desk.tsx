import type { ReportSummary } from "@clc/api/features/reports/client";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { CatalogSearchField } from "#/components/catalog-filter-controls";
import { MarketViewportSearchNotice } from "#/components/market-viewport-search-notice";
import { Button } from "#/components/ui/button";
import { DeskTable, type DeskColumn } from "#/desktop/ui/data-table";
import { DeskCanvas, DeskTitle } from "#/desktop/ui/page";
import { useStorageOwner } from "#/features/auth/hooks/use-storage-owner";
import { useReportFeed } from "#/features/home/hooks/use-filtered-reports";
import { useReportsInfinite } from "#/features/home/hooks/use-reports";
import { ReportFilterFeedback, ReportFilterSheet } from "#/features/home/ui/report-filter-ui";
import { CATALOG_FILTER_PREFERENCE_NAMES } from "#/lib/navigation/catalog-filter-preference-storage";
import { usePersistedCatalogFilter } from "#/lib/navigation/use-persisted-catalog-filter";
import { formatReportDate } from "#/lib/report-display";

export function PostsDesk() {
  const { t, i18n } = useLingui();
  const filter = usePersistedCatalogFilter(
    CATALOG_FILTER_PREFERENCE_NAMES.posts,
    useStorageOwner(),
    { voucherRelationships: true, poolRelationships: true },
  );
  const reportsQuery = useReportsInfinite(
    undefined,
    !filter.isFiltered && !filter.isRestoringPreference,
  );
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filtersEverOpened, setFiltersEverOpened] = useState(false);
  const feed = useReportFeed(
    filter,
    {
      reports: reportsQuery.data?.pages.flatMap((page) => page.reports) ?? [],
      isPending: reportsQuery.isPending,
      error: reportsQuery.error ?? null,
      retry: () => void reportsQuery.refetch(),
      retrying: reportsQuery.isFetching,
      hasNextPage: reportsQuery.hasNextPage,
      fetchNextPage: () => void reportsQuery.fetchNextPage(),
      isFetchingNextPage: reportsQuery.isFetchingNextPage,
    },
    filtersEverOpened,
  );
  const locale = i18n.locales?.[0] ?? i18n.locale;
  const reports = feed.reports;
  const isRefining = feed.status === "refining" || filter.isDebouncing;
  const resultCountLabel = i18n._("{count, plural, one {# post} other {# posts}}", {
    count: reports.length,
  });

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !feed.hasMore || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !feed.isLoadingMore) feed.loadMore();
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [feed.hasMore, feed.isLoadingMore, feed.loadMore]);

  const columns: DeskColumn<ReportSummary>[] = [
    {
      id: "title",
      header: <Trans>Title</Trans>,
      width: "1.6fr",
      sortValue: (row) => row.title,
      cell: (row) => row.title,
    },
    {
      id: "tags",
      header: <Trans>Tags</Trans>,
      sortValue: (row) => row.tags.join(", "),
      cell: (row) => row.tags.join(", "),
    },
    {
      id: "location",
      header: <Trans>Location</Trans>,
      sortValue: (row) => row.locationName ?? "",
      cell: (row) => row.locationName,
    },
    {
      id: "updated",
      header: <Trans>Updated</Trans>,
      width: "9rem",
      sortValue: (row) => row.updatedAt ?? "",
      cell: (row) => (
        <time dateTime={row.updatedAt ?? undefined} className="font-mono">
          {formatReportDate(row.updatedAt, locale)}
        </time>
      ),
    },
  ];

  return (
    <DeskCanvas width="full">
      <div className="mb-6 flex items-center justify-between gap-3">
        <DeskTitle>
          <Trans>Posts</Trans>
        </DeskTitle>
        <div className="flex gap-2">
          <Button asChild>
            <Link to="/posts/new">
              <Trans>New post</Trans>
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/posts/mine">
              <Trans>My posts</Trans>
            </Link>
          </Button>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <CatalogSearchField filter={filter} label={t`Search posts by title or description`} />
        </div>
        <ReportFilterSheet
          filter={filter}
          facets={feed.tagFacets}
          voucherFacets={feed.voucherFacets}
          poolFacets={feed.poolFacets}
          open={filtersOpen}
          onOpenChange={(next) => {
            if (next) setFiltersEverOpened(true);
            setFiltersOpen(next);
          }}
        />
      </div>

      <ReportFilterFeedback
        filter={filter}
        error={feed.error}
        onRetry={feed.retry}
        retrying={feed.retrying}
      />
      <MarketViewportSearchNotice
        query={filter.result.ok ? filter.result.filter.term : ""}
        className="mb-4"
      />

      {feed.status === "ready" && filter.result.ok ? (
        <p className="mb-3 font-mono text-sm">{resultCountLabel}</p>
      ) : null}

      {feed.status === "loading" ? (
        <p className="text-sm text-muted-foreground">
          <Trans>Loading posts…</Trans>
        </p>
      ) : null}

      {feed.status !== "loading" && feed.status !== "error" ? (
        <div className={isRefining ? "opacity-60" : undefined}>
          <DeskTable
            label={t`Posts`}
            rows={reports}
            columns={columns}
            rowKey={(row) => row.id}
            empty={
              filter.result.ok ? (
                filter.isFiltered ? (
                  <span className="flex flex-col items-start gap-3">
                    <Trans>No posts match this search.</Trans>
                    <Button variant="outline" onClick={filter.clear}>
                      <Trans>Clear filters</Trans>
                    </Button>
                  </span>
                ) : (
                  <Trans>No posts yet.</Trans>
                )
              ) : null
            }
            renderRow={(row, rowProps, cells) => (
              <Link to="/posts/$reportId" params={{ reportId: row.id }} {...rowProps}>
                {cells}
              </Link>
            )}
          />
        </div>
      ) : null}

      <div ref={loadMoreRef} className="h-px" aria-hidden="true" />
      {feed.isLoadingMore ? (
        <p className="mt-3 text-muted-foreground text-xs">
          <Trans>Loading more…</Trans>
        </p>
      ) : null}
    </DeskCanvas>
  );
}
