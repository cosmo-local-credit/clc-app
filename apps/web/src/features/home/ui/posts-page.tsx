import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { CatalogSearchField } from "#/components/catalog-filter-controls";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { ProgressiveImage } from "#/components/ui/progressive-image";
import { TagBadge } from "#/components/ui/tag-badge";
import { hueFromSeed } from "#/components/wallet/wallet-data";
import type { ReportSummary } from "#/features/home/api/reports-client";
import { useReportFeed } from "#/features/home/hooks/use-filtered-reports";
import { useReportsInfinite } from "#/features/home/hooks/use-reports";
import { CATALOG_FILTER_PREFERENCE_KEYS } from "#/lib/navigation/catalog-filter-preference-storage";
import { usePersistedCatalogFilter } from "#/lib/navigation/use-persisted-catalog-filter";
import { formatReportDate } from "./report-display";
import { ReportFilterFeedback, ReportFilterSheet } from "./report-filter-ui";

const VISIBLE_TAGS = 2;
const VISIBLE_VOUCHERS = 1;

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
        <section
          className={[
            "border border-border bg-card",
            isRefining ? "opacity-60 transition-opacity" : "",
          ].join(" ")}
          aria-busy={isRefining}
          aria-label={t`Field reports`}
        >
          {reports.map((report, index) => (
            <ReportRow key={report.id} report={report} isLast={index === reports.length - 1} />
          ))}
        </section>
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

function ReportRow({ report, isLast }: { report: ReportSummary; isLast: boolean }) {
  const { i18n } = useLingui();
  const extraTags = report.tags.length - VISIBLE_TAGS;
  const extraVouchers = report.vouchers.length - VISIBLE_VOUCHERS;
  const updated = formatReportDate(report.updatedAt, i18n.locale);

  return (
    <Link
      to="/posts/$reportId"
      params={{ reportId: report.id }}
      className={["flex gap-3 p-3 active:bg-muted", isLast ? "" : "border-b border-border"].join(
        " ",
      )}
    >
      <ReportThumbnail report={report} />

      <span className="flex min-w-0 flex-1 flex-col">
        <span className="line-clamp-1 font-heading text-sm font-semibold leading-snug [overflow-wrap:anywhere]">
          {report.title}
        </span>

        {report.description ? (
          <span className="mt-0.5 line-clamp-1 text-muted-foreground text-xs leading-snug [overflow-wrap:anywhere]">
            {report.description}
          </span>
        ) : null}

        {report.tags.length > 0 ? (
          <span className="mt-1.5 flex min-w-0 items-center gap-1 overflow-hidden">
            {report.tags.slice(0, VISIBLE_TAGS).map((tag) => (
              <TagBadge
                key={tag}
                tag={tag}
                labelClassName="block min-w-0 truncate"
                className="h-5 min-w-0 max-w-20 shrink overflow-hidden px-1.5 text-[0.625rem]"
              />
            ))}
            {extraTags > 0 ? (
              <span className="shrink-0 text-muted-foreground text-[0.625rem]">+{extraTags}</span>
            ) : null}
          </span>
        ) : null}

        <span className="mt-1 flex h-5 min-w-0 items-center justify-between gap-2">
          {updated && report.updatedAt ? (
            <time
              dateTime={report.updatedAt}
              className="inline-flex h-full shrink-0 items-center text-muted-foreground text-xs leading-none"
            >
              {updated}
            </time>
          ) : null}
          {report.vouchers.length > 0 ? (
            <span className="ml-auto flex h-full min-w-0 items-center justify-end gap-1">
              {report.vouchers.slice(0, VISIBLE_VOUCHERS).map((voucher) => (
                <Badge
                  key={voucher.address}
                  variant="outline"
                  className="h-full min-w-0 max-w-20 truncate px-1.5 font-mono text-[0.625rem] text-info"
                >
                  {voucher.symbol}
                </Badge>
              ))}
              {extraVouchers > 0 ? (
                <Badge
                  variant="outline"
                  className="h-full px-1.5 font-mono text-[0.625rem] text-muted-foreground"
                >
                  {extraVouchers}+
                </Badge>
              ) : null}
            </span>
          ) : null}
        </span>
      </span>
    </Link>
  );
}

function ReportThumbnail({ report }: { report: ReportSummary }) {
  if (!report.imageUrl) {
    return (
      <span
        aria-hidden="true"
        className="flex min-h-16 w-16 shrink-0 self-stretch items-center justify-center font-heading text-xl font-bold text-white"
        style={{ background: hueFromSeed(report.id) }}
      >
        {report.title.trim().slice(0, 1).toLocaleUpperCase() || "R"}
      </span>
    );
  }

  return (
    <span className="relative block min-h-16 w-16 shrink-0 self-stretch overflow-hidden bg-muted">
      <ProgressiveImage
        src={report.imageUrl}
        alt=""
        loading="lazy"
        className="absolute inset-0 size-full object-cover"
      />
    </span>
  );
}
