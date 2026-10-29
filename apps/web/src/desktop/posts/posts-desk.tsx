import type { ReportSummary } from "@clc/api/features/reports/client";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { useEffect, useId, useRef, useState } from "react";
import { RiAddLine, RiFilter3Line } from "react-icons/ri";

import { CatalogSearchField } from "#/components/catalog-filter-controls";
import { MarketViewportSearchNotice } from "#/components/market-viewport-search-notice";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { ProgressiveImage } from "#/components/ui/progressive-image";
import { TagBadge } from "#/components/ui/tag-badge";
import { hueFromSeed } from "#/components/wallet/wallet-data";
import { DeskCanvas, DeskTitleRow } from "#/desktop/ui/page";
import { useStorageOwner } from "#/features/auth/hooks/use-storage-owner";
import { useReportFeed } from "#/features/home/hooks/use-filtered-reports";
import { useReportsInfinite } from "#/features/home/hooks/use-reports";
import { useReportFilterNotice } from "#/features/home/hooks/use-report-filter-notice";
import { CATALOG_FILTER_PREFERENCE_NAMES } from "#/lib/navigation/catalog-filter-preference-storage";
import { usePersistedCatalogFilter } from "#/lib/navigation/use-persisted-catalog-filter";
import { formatReportDate } from "#/lib/report-display";
import { cn } from "#/lib/utils";

import { PostFacets } from "./post-facets";

const VISIBLE_TAGS = 2;

/**
 * Cards fill whatever width the feed has: as many 220px-or-wider columns as
 * fit, so a narrow feed shows fewer, readable cards instead of three crushed ones.
 */
const POST_GRID = "grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4";

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
  // Below 56rem of canvas the facets leave the page and open from the toolbar,
  // so the cards keep their width. Wider, they dock beside the feed and this
  // state is unused. Either way the facets stay mounted, so their vocabulary
  // loads at once.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersId = useId();
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
    true,
  );
  const notice = useReportFilterNotice({
    filter,
    error: feed.error,
    onRetry: feed.retry,
    retrying: feed.retrying,
  });
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

  const activeFilters = filter.tags.length + filter.vouchers.length + filter.pools.length;

  return (
    <DeskCanvas
      width="read"
      className="gap-4 @min-[56rem]:grid-cols-[240px_minmax(0,1fr)] @min-[56rem]:grid-rows-[auto_1fr] @min-[56rem]:gap-x-8"
    >
      <div className="grid min-w-0 content-start gap-4 @min-[56rem]:col-start-2 @min-[56rem]:row-start-1">
        <DeskTitleRow
          title={<Trans>Posts</Trans>}
          actions={
            <>
              <Button asChild variant="outline">
                <Link to="/posts/mine">
                  <Trans>My posts</Trans>
                </Link>
              </Button>
              <Button asChild>
                <Link to="/posts/new">
                  <RiAddLine aria-hidden="true" />
                  <Trans>New post</Trans>
                </Link>
              </Button>
            </>
          }
        />

        <div className="flex items-center gap-3">
          <div className="min-w-0 max-w-[420px] flex-1">
            <CatalogSearchField filter={filter} label={t`Search posts`} />
          </div>
          <Button
            variant="outline"
            className="@min-[56rem]:hidden"
            aria-expanded={filtersOpen}
            aria-controls={filtersId}
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <RiFilter3Line aria-hidden="true" />
            <Trans>Filters</Trans>
            {activeFilters > 0 ? (
              <>
                {" "}
                <Badge size="sm" className="font-mono">
                  {activeFilters}
                </Badge>
              </>
            ) : null}
          </Button>
          {feed.status === "ready" && filter.result.ok ? (
            <span className="ms-auto text-muted-foreground text-xs">{resultCountLabel}</span>
          ) : null}
        </div>
      </div>

      <div
        id={filtersId}
        className={cn(
          "min-w-0 border border-border bg-card p-4",
          "@min-[56rem]:col-start-1 @min-[56rem]:row-span-2 @min-[56rem]:row-start-1 @min-[56rem]:self-start @min-[56rem]:border-0 @min-[56rem]:bg-transparent @min-[56rem]:p-0",
          !filtersOpen && "@max-[56rem]:hidden",
        )}
      >
        <PostFacets
          filter={filter}
          tagFacets={feed.tagFacets}
          voucherFacets={feed.voucherFacets}
          poolFacets={feed.poolFacets}
        />
      </div>

      <div className="grid min-w-0 content-start gap-4 @min-[56rem]:col-start-2 @min-[56rem]:row-start-2">
        {notice ? (
          <div
            role="alert"
            className="flex min-h-14 items-center gap-3 border border-border bg-card px-4 py-2.5"
          >
            <p className="min-w-0 flex-1 text-sm">{notice.message}</p>
            {notice.actionLabel && notice.onAction ? (
              <Button
                variant="outline"
                className="shrink-0"
                pending={notice.actionPending}
                onClick={notice.onAction}
              >
                {notice.actionLabel}
              </Button>
            ) : null}
          </div>
        ) : null}
        <MarketViewportSearchNotice query={filter.result.ok ? filter.result.filter.term : ""} />

        {feed.status === "loading" ? (
          <div aria-busy="true" aria-label={t`Loading posts…`} className={POST_GRID}>
            {[0, 1, 2].map((index) => (
              <div key={index} className="aspect-[4/3] border border-border bg-card" />
            ))}
          </div>
        ) : null}

        {feed.status !== "loading" && feed.status !== "error" && filter.result.ok ? (
          reports.length === 0 ? (
            <div className="grid justify-items-start gap-3 border border-border bg-card p-4">
              {filter.isFiltered ? (
                <>
                  <p className="text-sm">
                    <Trans>No posts match this search.</Trans>
                  </p>
                  <Button variant="outline" onClick={filter.clear}>
                    <Trans>Clear filters</Trans>
                  </Button>
                </>
              ) : (
                <p className="text-sm">
                  <Trans>No posts yet.</Trans>
                </p>
              )}
            </div>
          ) : (
            <ul
              aria-label={t`Posts`}
              aria-busy={isRefining}
              className={cn(POST_GRID, isRefining && "opacity-60")}
            >
              {reports.map((report) => (
                <li key={report.id} className="min-w-0">
                  <PostCard report={report} locale={locale} />
                </li>
              ))}
            </ul>
          )
        ) : null}

        <div ref={loadMoreRef} className="h-px" aria-hidden="true" />
        {feed.isLoadingMore ? (
          <p className="text-muted-foreground text-xs">
            <Trans>Loading more…</Trans>
          </p>
        ) : null}
      </div>
    </DeskCanvas>
  );
}

function PostCard({ report, locale }: { report: ReportSummary; locale: string }) {
  const updated = formatReportDate(report.updatedAt, locale);
  const extraTags = report.tags.length - VISIBLE_TAGS;
  const voucher = report.vouchers[0];
  const pool = voucher ? undefined : report.pools[0];

  return (
    <Link
      to="/posts/$reportId"
      params={{ reportId: report.id }}
      className="flex h-full flex-col border border-border bg-card outline-none hover:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foreground"
    >
      <span className="relative block aspect-video overflow-hidden bg-muted">
        {report.imageUrl ? (
          <ProgressiveImage
            src={report.imageUrl}
            alt=""
            loading="lazy"
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="absolute inset-0 flex items-center justify-center font-heading text-lg font-bold text-white"
            style={{ background: hueFromSeed(report.id) }}
          >
            {report.title.trim().slice(0, 1).toLocaleUpperCase() || "R"}
          </span>
        )}
      </span>
      <span className="grid gap-1.5 p-3">
        <span className="line-clamp-2 text-sm font-semibold leading-snug [overflow-wrap:anywhere]">
          {report.title}
        </span>
        {report.tags.length > 0 ? (
          <span className="flex min-w-0 items-center gap-1 overflow-hidden">
            {report.tags.slice(0, VISIBLE_TAGS).map((tag) => (
              <TagBadge
                key={tag}
                tag={tag}
                size="sm"
                labelClassName="block min-w-0 truncate"
                className="min-w-0 max-w-28 shrink overflow-hidden"
              />
            ))}
            {extraTags > 0 ? (
              <Badge variant="outline" size="sm">
                +{extraTags}
              </Badge>
            ) : null}
          </span>
        ) : null}
        <span className="flex h-5 min-w-0 items-center gap-2">
          {updated && report.updatedAt ? (
            <time
              dateTime={report.updatedAt}
              className="shrink-0 font-mono text-muted-foreground text-xs"
            >
              {updated}
            </time>
          ) : null}
          {voucher ? (
            <Badge
              variant="outline"
              size="sm"
              className="ms-auto min-w-0 max-w-28 truncate font-mono"
            >
              {voucher.symbol}
            </Badge>
          ) : pool ? (
            <Badge
              variant="outline"
              size="sm"
              className="ms-auto min-w-0 max-w-36 truncate text-info"
            >
              {pool.name}
            </Badge>
          ) : null}
        </span>
      </span>
    </Link>
  );
}
