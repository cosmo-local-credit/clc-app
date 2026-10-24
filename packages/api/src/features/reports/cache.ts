import type { ReportStatus } from "@clc/core/features/reports/logic";
import type { QueryClient } from "@tanstack/react-query";

import type { ManagedReportDetail, ReportDetail } from "./client";
import { reportKeys } from "./queries";

/**
 * What a post write does to the cache once the server has accepted it.
 *
 * Nothing here is optimistic. Status is the server's answer — a normal author's
 * edit resubmits, a superadmin's preserves — so predicting it locally would show
 * a post as published that is queued for review, or the reverse.
 *
 * Details are seeded from the mutation response; lists are invalidated. A list's
 * membership depends on the filter, the status and `updated_at DESC` ordering,
 * all three of which a write can change, so patching a cursor page whose
 * membership cannot be proven locally would be a guess.
 *
 * The families are kept apart because a write does not affect them equally, and
 * because `reportKeys.all` also covers `apps/web`'s reverse-geocode entries.
 */

/**
 * The public list keys, by their discriminating segment.
 *
 * A prefix test would be wrong: `detail`, `mine`, `admin`, `location` and
 * `facet-vocabulary` share the same two-segment root and need different
 * treatment.
 */
const PUBLIC_LIST_SEGMENTS = new Set(["list", "feed", "filtered", "voucher"]);

function isPublicReportListKey(queryKey: readonly unknown[]): boolean {
  const [namespace, resource, family] = queryKey;
  return (
    namespace === "clc" &&
    resource === "reports" &&
    typeof family === "string" &&
    PUBLIC_LIST_SEGMENTS.has(family)
  );
}

/** The `mine` and `admin` list keys, but not their seeded detail entries. */
function isManagedReportListKey(queryKey: readonly unknown[]): boolean {
  const [namespace, resource, family] = queryKey;
  if (namespace !== "clc" || resource !== "reports") return false;
  if (family === "admin") return queryKey[3] === "list";
  if (family === "mine") return queryKey[4] === "list";
  return false;
}

function invalidateManagedReportLists(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({
    predicate: (query) => isManagedReportListKey(query.queryKey),
  });
}

function invalidatePublicReportLists(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({
    predicate: (query) => isPublicReportListKey(query.queryKey),
  });
}

/**
 * Whether the public catalog could have changed.
 *
 * True when either end of the transition is approved, and true when the previous
 * status is unknown: a caller that cannot say what the post was must not be the
 * reason published content stays stale.
 */
function touchesPublicCatalog(
  previousStatus: ReportStatus | null | undefined,
  nextStatus: ReportStatus | null,
): boolean {
  if (previousStatus === undefined) return true;
  return previousStatus === "APPROVED" || nextStatus === "APPROVED";
}

/**
 * Writes a post into every managed detail key and reconciles the public one.
 *
 * The public detail is seeded only while the post is approved. When it is not,
 * the entry is dropped rather than invalidated: the record no longer exists
 * publicly, so a refetch would 404, and leaving the pre-mutation approved copy
 * in place would render withdrawn content.
 */
function seedReportDetails(
  queryClient: QueryClient,
  report: ManagedReportDetail,
  authorAddress: string | null | undefined,
): void {
  queryClient.setQueryData(reportKeys.adminDetail(report.id), report);
  const owner = authorAddress ?? report.authorAddress;
  if (owner) {
    queryClient.setQueryData(reportKeys.myDetail(owner, report.id), report);
  }

  if (report.status === "APPROVED") {
    queryClient.setQueryData(reportKeys.detail(report.id), asPublicReportDetail(report));
  } else {
    queryClient.removeQueries({ queryKey: reportKeys.detail(report.id), exact: true });
  }
}

function asPublicReportDetail(report: ManagedReportDetail): ReportDetail {
  const { authorAddress: _authorAddress, ...publicReport } = report;
  return { ...publicReport, status: null };
}

/**
 * A newly created post.
 *
 * A normal user's is `SUBMITTED` and touches no public list, so the feed is left
 * alone — invalidating it would refetch the whole catalog for a row nobody can
 * see. A superadmin's is `APPROVED` and does.
 */
export function settleReportCreate(
  queryClient: QueryClient,
  report: ManagedReportDetail,
  authorAddress?: string | null,
): Promise<unknown> {
  seedReportDetails(queryClient, report, authorAddress);

  const settlements = [invalidateManagedReportLists(queryClient)];
  if (report.status === "APPROVED") {
    settlements.push(invalidatePublicReportLists(queryClient));
  }
  return Promise.all(settlements);
}

/**
 * An edited post.
 *
 * Managed lists always: title, tags, vouchers, status and `updatedAt` can each
 * change filter membership or ordering. Public lists when either end of the
 * transition was approved — an admin edit that stays approved changed published
 * content, and an author edit that resubmits removed it.
 */
export function settleReportUpdate(
  queryClient: QueryClient,
  report: ManagedReportDetail,
  previousStatus: ReportStatus | null | undefined,
  authorAddress?: string | null,
): Promise<unknown> {
  seedReportDetails(queryClient, report, authorAddress);

  const settlements = [invalidateManagedReportLists(queryClient)];
  if (touchesPublicCatalog(previousStatus, report.status)) {
    settlements.push(invalidatePublicReportLists(queryClient));
  }
  return Promise.all(settlements);
}

/** Approval publishes the post, so every family changes. */
export function settleReportApproval(
  queryClient: QueryClient,
  report: ManagedReportDetail,
  authorAddress?: string | null,
): Promise<unknown> {
  seedReportDetails(queryClient, report, authorAddress);
  return Promise.all([
    invalidateManagedReportLists(queryClient),
    invalidatePublicReportLists(queryClient),
  ]);
}

/**
 * A hard-deleted post.
 *
 * Every detail entry for the id is removed rather than set to null: the row is
 * gone, and "not fetched" already means what a cached null would.
 */
export function settleReportDeletion(
  queryClient: QueryClient,
  reportID: string,
  previousStatus: ReportStatus | null | undefined,
  authorAddress?: string | null,
): Promise<unknown> {
  queryClient.removeQueries({ queryKey: reportKeys.detail(reportID), exact: true });
  queryClient.removeQueries({ queryKey: reportKeys.adminDetail(reportID), exact: true });
  if (authorAddress) {
    queryClient.removeQueries({
      queryKey: reportKeys.myDetail(authorAddress, reportID),
      exact: true,
    });
  } else {
    // Without a session address there is no one author key to name, so every
    // author's detail entry for this id goes.
    queryClient.removeQueries({
      predicate: (query) =>
        query.queryKey[2] === "mine" &&
        query.queryKey[4] === "detail" &&
        query.queryKey[5] === reportID,
    });
  }

  const settlements = [invalidateManagedReportLists(queryClient)];
  if (touchesPublicCatalog(previousStatus, null)) {
    settlements.push(invalidatePublicReportLists(queryClient));
  }
  return Promise.all(settlements);
}
