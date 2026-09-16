import { settleReportCreate, settleReportUpdate } from "@clc/api/features/reports/cache";
import type { ManagedReportDetail } from "@clc/api/features/reports/client";
import type { ReportStatus, ReportWrite } from "@clc/core/features/reports/logic";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { reportsClient } from "#/lib/api/reports";

/**
 * The author's own post writes.
 *
 * Nothing is optimistic. The resulting status is the server's — an author's edit
 * resubmits, which takes an approved post out of the public feed — so the
 * response is what the cache is settled from. A failure leaves the form and its
 * already-uploaded URLs alone.
 */
export function useCreatePost() {
  const queryClient = useQueryClient();
  const { session } = useAuthStatus();

  return useMutation({
    mutationFn: (input: ReportWrite) => reportsClient.createReport(input),
    onSuccess: (report: ManagedReportDetail) =>
      settleReportCreate(queryClient, report, session?.address),
  });
}

/**
 * An edit of the author's own post.
 *
 * `previousStatus` decides whether the public catalog is invalidated, so it is
 * the status the editor loaded rather than a guess. `undefined` invalidates
 * conservatively.
 */
export function useUpdatePost(previousStatus: ReportStatus | null | undefined) {
  const queryClient = useQueryClient();
  const { session } = useAuthStatus();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ReportWrite }) =>
      reportsClient.updateReport(id, input),
    onSuccess: (report: ManagedReportDetail) =>
      settleReportUpdate(queryClient, report, previousStatus, session?.address),
  });
}
