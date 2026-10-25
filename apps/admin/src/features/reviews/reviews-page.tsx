import type { AdminReviewFlag } from "@clc/api/features/admin/client";
import { adminKeys, adminReviewsQueryOptions } from "@clc/api/features/admin/queries";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "#/components/admin/confirm-dialog";
import { DataTable } from "#/components/admin/data-table";
import { EmptyState } from "#/components/admin/empty-state";
import { LoadingBlock } from "#/components/admin/loading-block";
import { PageHeader } from "#/components/admin/page-header";
import { PageState } from "#/components/admin/page-state";
import { StaleNotice } from "#/components/admin/stale-notice";
import { Button } from "#/components/ui/button";
import { clcApi } from "#/lib/api";
import { errorMessage } from "#/lib/data-state";
import { formatDateTime } from "#/lib/format";
import { useDataState } from "#/lib/use-data-state";

export type ReviewSearch = { before?: number };

export function parseReviewSearch(search: Record<string, unknown>): ReviewSearch {
  const parsed = typeof search.before === "string" ? Number(search.before) : search.before;
  if (typeof parsed !== "number" || !Number.isSafeInteger(parsed) || parsed <= 0) return {};
  return { before: parsed };
}

type ReviewAction = { flag: AdminReviewFlag; action: "hide" | "dismiss" };

export function ReviewsPage({ search }: { search: ReviewSearch }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [action, setAction] = useState<ReviewAction | null>(null);
  const reviewsQuery = useQuery(
    adminReviewsQueryOptions(clcApi.admin, search.before ? { before: search.before } : {}),
  );
  const resolve = useMutation({
    mutationFn: (next: ReviewAction) => clcApi.admin.resolveReviewFlag(next.flag.id, next.action),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [...adminKeys.all, "reviews"] });
      toast.success(action?.action === "hide" ? "Review hidden" : "Flag dismissed");
      setAction(null);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const state = useDataState(reviewsQuery, (page) => page.notifications.length === 0);
  const rows = reviewsQuery.data?.notifications ?? [];

  const columns: Array<ColumnDef<AdminReviewFlag>> = [
    {
      id: "voucher",
      header: "Voucher",
      cell: ({ row }) => (
        <Link
          to="/vouchers/$address"
          params={{ address: row.original.voucherAddress }}
          search={{ tab: "offerings" }}
          className="font-data text-xs underline-offset-4 hover:underline"
        >
          {formatVoucherAddress(row.original.voucherAddress as `0x${string}`)}
        </Link>
      ),
    },
    {
      accessorKey: "reason",
      header: "Reason",
      cell: ({ row }) => <span className="text-sm">{row.original.reason}</span>,
    },
    {
      id: "stars",
      header: "Stars",
      cell: ({ row }) => (
        <span className="font-data text-xs">
          {row.original.reportedStars} / {row.original.stars}
        </span>
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Flagged",
      cell: ({ row }) => (
        <span className="font-data text-xs">{formatDateTime(row.original.createdAt)}</span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <span className="flex justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setAction({ flag: row.original, action: "dismiss" })}
          >
            Dismiss
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={() => setAction({ flag: row.original, action: "hide" })}
          >
            Hide
          </Button>
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Reviews" />
      {state.kind === "pending" ? (
        <LoadingBlock rows={6} />
      ) : state.kind === "error" ? (
        <PageState title="Could not load reviews" message={state.message} />
      ) : (
        <>
          {state.kind === "stale" ? <StaleNotice message={state.message} /> : null}
          <DataTable
            columns={columns}
            data={rows}
            emptyState={<EmptyState title="No open flags" />}
            footer={
              <div className="flex justify-end gap-2 px-3 py-2">
                {search.before ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void navigate({ to: "/reviews", search: {} })}
                  >
                    First
                  </Button>
                ) : null}
                {reviewsQuery.data?.next ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void navigate({
                        to: "/reviews",
                        search: { before: reviewsQuery.data?.next ?? undefined },
                      })
                    }
                  >
                    Older
                  </Button>
                ) : null}
              </div>
            }
          />
        </>
      )}
      <ConfirmDialog
        open={action !== null}
        title={action?.action === "hide" ? "Hide review" : "Dismiss flag"}
        description={
          action?.action === "hide"
            ? "Hiding removes the review and resolves every open flag on it."
            : "Dismissing leaves the review visible and closes this flag."
        }
        confirmLabel={action?.action === "hide" ? "Hide" : "Dismiss"}
        destructive={action?.action === "hide"}
        pending={resolve.isPending}
        onCancel={() => setAction(null)}
        onConfirm={() => {
          if (action) resolve.mutate(action);
        }}
      />
    </div>
  );
}
