import { BackendApiError } from "@clc/api/client/errors";
import { useLingui } from "@lingui/react/macro";

import { FilteredReportsTooLargeError } from "#/features/home/hooks/use-filtered-reports";
import type { PersistedCatalogFilterControls } from "#/lib/navigation/use-persisted-catalog-filter";

/**
 * What the posts feed has to say about its filter or its load, if anything:
 * a message and, where one helps, the action that fixes it.
 */
export function useReportFilterNotice({
  filter,
  error,
  onRetry,
  retrying,
}: {
  filter: PersistedCatalogFilterControls;
  error: Error | null;
  onRetry: () => void;
  retrying: boolean;
}): {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  actionPending?: boolean;
} | null {
  const { t } = useLingui();

  if (!filter.result.ok) {
    return {
      message:
        filter.result.reason === "invalid-vouchers"
          ? t`This link contains an invalid voucher filter.`
          : filter.result.reason === "invalid-pools"
            ? t`This link contains an invalid pool filter.`
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
  return {
    message: t`Couldn't load posts.`,
    actionLabel: t`Try again`,
    onAction: onRetry,
    actionPending: retrying,
  };
}
