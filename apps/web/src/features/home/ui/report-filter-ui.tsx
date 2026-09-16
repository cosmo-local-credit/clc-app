import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";

import { CatalogFilterSheet } from "#/components/catalog-filter-controls";
import { Button } from "#/components/ui/button";
import { BackendApiError } from "@clc/api/client/errors";
import { useVoucherSearch } from "#/features/home/hooks/use-voucher-search";
import type { ReportTagFacet, ReportVoucherFacet } from "@clc/api/features/reports/client";
import { FilteredReportsTooLargeError } from "#/features/home/hooks/use-filtered-reports";
import type { PersistedCatalogFilterControls } from "#/lib/navigation/use-persisted-catalog-filter";

export function ReportFilterSheet({
  filter,
  facets,
  voucherFacets,
  open,
  onOpenChange,
}: {
  filter: PersistedCatalogFilterControls;
  facets: ReportTagFacet[];
  voucherFacets: ReportVoucherFacet[];
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const [voucherQuery, setVoucherQuery] = useState("");
  const voucherSearch = useVoucherSearch(voucherQuery, setVoucherQuery, open);

  return (
    <CatalogFilterSheet
      filter={filter}
      facets={facets}
      title={<Trans>Filter posts</Trans>}
      facetTitle={<Trans>Categories</Trans>}
      voucherFacets={voucherFacets}
      voucherSearch={voucherSearch}
      showHeader={false}
      open={open}
      onOpenChange={onOpenChange}
      onApply={filter.applyFacetFilters}
    />
  );
}

export function ReportFilterFeedback({
  filter,
  error,
  onRetry,
}: {
  filter: PersistedCatalogFilterControls;
  error: Error | null;
  onRetry: () => void;
}) {
  const { t } = useLingui();

  const notice = (() => {
    if (!filter.result.ok) {
      return {
        message:
          filter.result.reason === "invalid-vouchers"
            ? t`This link contains an invalid voucher filter.`
            : t`This link has too many filters (${filter.result.requested}, maximum ${filter.result.max}).`,
        actionLabel: t`Clear filters`,
        onAction: filter.clear,
      };
    }
    if (!error) return null;

    if (error instanceof FilteredReportsTooLargeError) {
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
    return { message: t`Couldn't load posts.`, actionLabel: t`Try again`, onAction: onRetry };
  })();

  if (!notice) return null;

  return (
    <div className="space-y-3 border border-border bg-card p-4" role="alert">
      <p className="text-muted-foreground text-sm">{notice.message}</p>
      {notice.actionLabel && notice.onAction ? (
        <Button variant="outline" size="sm" className="h-9 bg-card" onClick={notice.onAction}>
          {notice.actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
