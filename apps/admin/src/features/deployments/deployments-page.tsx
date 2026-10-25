import type { AdminDeployment } from "@clc/api/features/admin/client";
import { adminDeploymentsQueryOptions } from "@clc/api/features/admin/queries";
import type { DeploymentContractType } from "@clc/api/features/deployments/client";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import { getAddress, isAddress } from "viem";
import { useMutation, useQueries, useQuery } from "@tanstack/react-query";
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
import { TablePagination } from "#/components/admin/table-pagination";
import { Button } from "#/components/ui/button";
import { clcApi } from "#/lib/api";
import { errorMessage } from "#/lib/data-state";
import { formatDateTime } from "#/lib/format";
import { type TableSearch } from "#/lib/table-search";
import { useDataState } from "#/lib/use-data-state";
import { usePagedTable } from "#/lib/use-paged-table";
import { useNavigate } from "@tanstack/react-router";

type UpgradeTarget = { kind: DeploymentContractType; address: string; symbol: string };

export function DeploymentsPage({ search }: { search: TableSearch }) {
  const navigate = useNavigate();
  const [upgrade, setUpgrade] = useState<UpgradeTarget | null>(null);
  const deploymentsQuery = useQuery(
    adminDeploymentsQueryOptions(clcApi.admin, {
      perPage: search.perPage,
      cursor: search.cursor,
      next: search.dir === undefined ? undefined : search.dir === "next",
    }),
  );
  const rows = deploymentsQuery.data?.deployments ?? [];
  const contracts = useQueries({
    queries: rows.map((row) => ({
      queryKey: ["clc", "admin", "deployment-contract", row.trackingId, row.resourceType],
      queryFn: () =>
        clcApi.deployments.getDeploymentContract(
          row.trackingId,
          row.resourceType as DeploymentContractType,
        ),
      enabled: row.resourceType === "TOKEN" || row.resourceType === "POOL",
    })),
  });
  const submit = useMutation({
    mutationFn: (target: UpgradeTarget) =>
      target.kind === "TOKEN"
        ? clcApi.admin.upgradeToken(target.address)
        : clcApi.admin.upgradePool(target.address),
    onSuccess: (result) => {
      toast.success(`Upgrade queued ${result.trackingId}`);
      setUpgrade(null);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const state = useDataState(deploymentsQuery, (page) => page.deployments.length === 0);
  const table = usePagedTable({
    search,
    page: deploymentsQuery.data,
    navigate: (next) => void navigate({ to: "/deployments", search: next }),
  });

  const columns: Array<ColumnDef<AdminDeployment>> = [
    {
      accessorKey: "trackingId",
      header: "Tracking",
      cell: ({ row }) => (
        <span className="font-data text-xs">{row.original.trackingId.slice(0, 8)}</span>
      ),
    },
    {
      accessorKey: "resourceType",
      header: "Kind",
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.resourceType}</span>,
    },
    {
      id: "contract",
      header: "Contract",
      cell: ({ row }) => {
        const contract = contracts[row.index]?.data;
        const address = contract?.address;
        return (
          <span className="font-data text-xs">
            {address && isAddress(address) ? formatVoucherAddress(getAddress(address)) : "—"}
          </span>
        );
      },
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <span className="font-mono text-xs">{contracts[row.index]?.data?.status || "—"}</span>
      ),
    },
    {
      accessorKey: "userName",
      header: "Account",
      cell: ({ row }) => <span className="text-sm">{row.original.userName || "—"}</span>,
    },
    {
      accessorKey: "createdAt",
      header: "Created",
      cell: ({ row }) => (
        <span className="font-data text-xs">{formatDateTime(row.original.createdAt)}</span>
      ),
    },
    {
      id: "upgrade",
      header: "",
      cell: ({ row }) => {
        const kind = row.original.resourceType;
        const contract = contracts[row.index]?.data;
        if ((kind !== "TOKEN" && kind !== "POOL") || !contract?.address) return null;
        return (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              setUpgrade({
                kind,
                address: contract.address as string,
                symbol: contract.symbol || kind,
              })
            }
          >
            Upgrade
          </Button>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Deployments" />
      {state.kind === "pending" ? (
        <LoadingBlock rows={6} />
      ) : state.kind === "error" ? (
        <PageState title="Could not load deployments" message={state.message} />
      ) : (
        <>
          {state.kind === "stale" ? <StaleNotice message={state.message} /> : null}
          <DataTable
            columns={columns}
            data={rows}
            emptyState={<EmptyState title="No deployments" />}
            footer={
              <TablePagination
                search={search}
                dropped={0}
                isFirstPage={table.isFirstPage}
                mightHaveMore={table.mightHaveMore}
                isFetching={deploymentsQuery.isFetching}
                onFirstPage={table.onFirstPage}
                onPreviousPage={table.onPreviousPage}
                onNextPage={table.onNextPage}
                onPageSize={table.onPageSize}
              />
            }
          />
        </>
      )}
      <ConfirmDialog
        open={upgrade !== null}
        title="Upgrade contract"
        description={
          upgrade
            ? `${upgrade.symbol} at ${upgrade.address} will be queued onto the current implementation.`
            : ""
        }
        confirmLabel="Upgrade"
        pending={submit.isPending}
        onCancel={() => setUpgrade(null)}
        onConfirm={() => {
          if (upgrade) submit.mutate(upgrade);
        }}
      />
    </div>
  );
}
