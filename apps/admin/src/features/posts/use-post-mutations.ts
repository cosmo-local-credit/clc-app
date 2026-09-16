import {
  settleReportApproval,
  settleReportCreate,
  settleReportDeletion,
  settleReportUpdate,
} from "@clc/api/features/reports/cache";
import type { ManagedReportDetail } from "@clc/api/features/reports/client";
import { deploymentKeys } from "@clc/api/features/deployments/queries";
import type { ReportStatus, ReportWrite } from "@clc/core/features/reports/logic";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { clcApi } from "#/lib/api";

/**
 * The console's post writes.
 *
 * All four go through `@clc/api`'s settlement helpers, so the invalidation
 * matrix is decided in one place for both apps rather than twice. Nothing is
 * optimistic: a superadmin's edit preserves status and a create publishes
 * immediately, and both facts come back in the response.
 *
 * `previousStatus` is what the screen loaded, and it decides whether the public
 * catalog is invalidated. Passing it rather than guessing is what keeps an admin
 * edit that stays approved from leaving stale published content on the feed.
 */
export function useCreatePost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ReportWrite) => clcApi.reports.createReport(input),
    onSuccess: async (report: ManagedReportDetail) => {
      await settleReportCreate(queryClient, report);
      return queryClient.invalidateQueries({ queryKey: deploymentKeys.tokenTags() });
    },
  });
}

export function useUpdatePost(previousStatus: ReportStatus | null | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ReportWrite }) =>
      clcApi.reports.updateReport(id, input),
    onSuccess: async (report: ManagedReportDetail) => {
      await settleReportUpdate(queryClient, report, previousStatus);
      return queryClient.invalidateQueries({ queryKey: deploymentKeys.tokenTags() });
    },
  });
}

/** Approval is not reversible in this contract, so every caller confirms first. */
export function useApprovePost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => clcApi.reports.approveReport(id),
    onSuccess: (report: ManagedReportDetail) => settleReportApproval(queryClient, report),
  });
}

/** A hard delete. The row and its relations are gone, so the id is removed. */
export function useDeletePost(previousStatus: ReportStatus | null | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => clcApi.reports.deleteReport(id),
    onSuccess: (id: string) => settleReportDeletion(queryClient, id, previousStatus),
  });
}
