import type { ReactNode } from "react";
import { EmptyState } from "#/components/admin/empty-state";
import { LoadingBlock } from "#/components/admin/loading-block";
import { PageState } from "#/components/admin/page-state";
import { StaleNotice } from "#/components/admin/stale-notice";
import type { DataState } from "#/lib/data-state";

/**
 * Renders one section according to its resolved data state.
 *
 * A section on a detail screen owns an independent resource — a pool's vouchers,
 * a voucher's offerings — so its failure must be contained. It renders an error
 * inside the section without discarding the successfully loaded parent.
 */
export function SectionState({
  state,
  errorTitle,
  emptyTitle,
  emptyDescription,
  loadingRows = 4,
  children,
}: {
  state: DataState;
  errorTitle: string;
  emptyTitle: string;
  emptyDescription?: string;
  loadingRows?: number;
  children: ReactNode;
}) {
  if (state.kind === "pending") return <LoadingBlock rows={loadingRows} />;
  if (state.kind === "error") return <PageState title={errorTitle} message={state.message} />;
  if (state.kind === "empty") {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  // `stale`: the refresh failed but cached rows are still worth showing. Keep
  // them, and say plainly that they may be out of date.
  return (
    <>
      {state.kind === "stale" ? <StaleNotice message={state.message} /> : null}
      {children}
    </>
  );
}
