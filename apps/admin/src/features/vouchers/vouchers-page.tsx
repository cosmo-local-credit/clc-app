import type { MarketVoucher } from "@clc/api/features/market/client";
import { clcQueries } from "@clc/api/queries";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "#/components/admin/data-table";
import { EmptyState } from "#/components/admin/empty-state";
import { LoadingBlock } from "#/components/admin/loading-block";
import { PageHeader } from "#/components/admin/page-header";
import { PageState } from "#/components/admin/page-state";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";

const PAGE_SIZE = 100;

const columns: Array<ColumnDef<MarketVoucher>> = [
  {
    accessorKey: "name",
    header: "Voucher",
    cell: ({ row }) => (
      <div className="min-w-0">
        <div className="truncate font-medium">{row.original.name}</div>
        <div className="font-mono text-xs text-muted-foreground">{row.original.symbol}</div>
      </div>
    ),
  },
  {
    accessorKey: "address",
    header: "Address",
    cell: ({ row }) => (
      <span className="font-data text-xs">{formatVoucherAddress(row.original.address)}</span>
    ),
  },
  {
    accessorKey: "kind",
    header: "Kind",
    cell: ({ row }) => (
      <Badge variant="outline" className="font-mono text-xs uppercase">
        {row.original.kind}
      </Badge>
    ),
  },
  {
    accessorKey: "chainId",
    header: "Chain",
    cell: ({ row }) => <span className="font-data">{row.original.chainId}</span>,
  },
  {
    accessorKey: "locationName",
    header: "Location",
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">{row.original.locationName ?? "—"}</span>
    ),
  },
];

export function VouchersPage() {
  const navigate = useNavigate();
  const vouchersQuery = useQuery(clcQueries.voucherList(PAGE_SIZE));

  const vouchers = vouchersQuery.data?.vouchers ?? [];
  const dropped = (vouchersQuery.data?.receivedCount ?? 0) - vouchers.length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Vouchers"
        description="Every voucher in the public catalog."
        actions={
          <span className="font-data text-xs text-muted-foreground">{vouchers.length} shown</span>
        }
      />

      {dropped > 0 ? (
        <Alert>
          <AlertTitle>
            {dropped} voucher{dropped === 1 ? "" : "s"} hidden
          </AlertTitle>
          <AlertDescription>
            The catalog endpoint returns only vouchers with valid coordinates and a known kind. Rows
            missing either are dropped at the API boundary and cannot be listed here.
          </AlertDescription>
        </Alert>
      ) : null}

      {vouchersQuery.isPending ? (
        <LoadingBlock rows={8} />
      ) : vouchersQuery.isError ? (
        <PageState
          title="Could not load vouchers"
          message={
            vouchersQuery.error instanceof Error ? vouchersQuery.error.message : "Request failed."
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={vouchers}
          onRowClick={(voucher) =>
            void navigate({ to: "/vouchers/$address", params: { address: voucher.address } })
          }
          emptyState={<EmptyState title="No vouchers" description="The catalog is empty." />}
        />
      )}
    </div>
  );
}
