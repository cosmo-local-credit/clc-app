import type { PretiumCashTransaction } from "@clc/api/features/pretium/client";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { getAddress, isAddress } from "viem";

import { DataTable } from "#/components/admin/data-table";
import { EmptyState } from "#/components/admin/empty-state";
import { ListToolbar } from "#/components/admin/list-toolbar";
import { LoadingBlock } from "#/components/admin/loading-block";
import { PageHeader } from "#/components/admin/page-header";
import { PageState } from "#/components/admin/page-state";
import { Badge } from "#/components/ui/badge";
import { Card, CardContent, CardHeader } from "#/components/ui/card";
import { StaleNotice } from "#/components/admin/stale-notice";
import { clcApi } from "#/lib/api";
import { formatDateTime } from "#/lib/format";
import { useDataState } from "#/lib/use-data-state";
import { mergeCashMovements } from "./cash-movements";

/** The raw draft stays in the URL. A partial address is not a query. */
export type CashSearch = { q?: string };

export function parseCashSearch(search: Record<string, unknown>): CashSearch {
  const raw = typeof search.q === "string" ? search.q.trim() : "";
  if (!raw) return {};
  return { q: raw };
}

const columns: Array<ColumnDef<PretiumCashTransaction>> = [
  {
    accessorKey: "kind",
    header: "Kind",
    cell: ({ row }) => <span className="font-mono text-xs uppercase">{row.original.kind}</span>,
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <Badge variant="outline">{row.original.status}</Badge>,
  },
  {
    accessorKey: "amountKes",
    header: "KES",
    cell: ({ row }) => <span className="font-data text-xs">{row.original.amountKes || "—"}</span>,
  },
  {
    accessorKey: "amountUsd",
    header: "USD",
    cell: ({ row }) => <span className="font-data text-xs">{row.original.amountUsd || "—"}</span>,
  },
  {
    accessorKey: "phoneNumber",
    header: "Phone",
    cell: ({ row }) => <span className="font-data text-xs">{row.original.phoneNumber || "—"}</span>,
  },
  {
    accessorKey: "reference",
    header: "Reference",
    cell: ({ row }) => <span className="font-data text-xs">{row.original.reference || "—"}</span>,
  },
  {
    accessorKey: "createdAt",
    header: "Created",
    cell: ({ row }) => (
      <span className="font-data text-xs">{formatDateTime(row.original.createdAt)}</span>
    ),
  },
];

export function CashPage({ search }: { search: CashSearch }) {
  const navigate = useNavigate();
  const address = search.q && isAddress(search.q) ? getAddress(search.q) : undefined;
  const recent = useQuery({
    queryKey: ["clc", "admin", "cash", "recent"],
    queryFn: () => clcApi.pretium.getPretiumRecentTransactions(),
  });
  const rates = useQuery({
    queryKey: ["clc", "admin", "cash", "rates"],
    queryFn: () => clcApi.pretium.getPretiumRates(),
  });
  const link = useQuery({
    queryKey: ["clc", "admin", "cash", "link", address ?? "none"],
    enabled: Boolean(address),
    queryFn: () => clcApi.pretium.getPretiumLinkByAddress(address as `0x${string}`),
  });
  const transactions = useQuery({
    queryKey: ["clc", "admin", "cash", "transactions", address ?? "none"],
    enabled: Boolean(address),
    queryFn: () => clcApi.pretium.getPretiumTransactionsByAddress(address as `0x${string}`),
  });
  const phone = useQuery({
    queryKey: ["clc", "admin", "cash", "phone", link.data?.phoneNumber ?? "none"],
    enabled: Boolean(link.data?.linked && link.data.phoneNumber),
    queryFn: () => clcApi.pretium.getPretiumTransactionsByPhone(link.data?.phoneNumber ?? ""),
  });
  const recentState = useDataState(
    recent,
    (page) => page.onramps.length + page.offramps.length === 0,
  );
  const recentRows = [...(recent.data?.onramps ?? []), ...(recent.data?.offramps ?? [])];
  const accountRows = mergeCashMovements(
    transactions.data?.onramps ?? [],
    transactions.data?.offramps ?? [],
    phone.data?.onramps ?? [],
    phone.data?.offramps ?? [],
  );
  const accountError = transactions.error ?? link.error ?? phone.error;
  const accountPending =
    transactions.isPending ||
    link.isPending ||
    (link.data?.linked && Boolean(link.data.phoneNumber) && phone.isPending);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Cash"
        actions={
          <ListToolbar
            search={search.q}
            searchPlaceholder="Wallet address"
            onSearchChange={(value) =>
              void navigate({
                to: "/cash",
                search: value.trim() ? { q: value } : {},
              })
            }
          />
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="border-b pb-4">
            <h2 className="text-muted-foreground font-mono text-xs tracking-[0.14em] uppercase">
              Rates
            </h2>
          </CardHeader>
          <CardContent className="pt-4">
            {rates.isError ? (
              <p role="alert" className="text-destructive text-xs">
                {errorOf(rates.error)}
              </p>
            ) : null}
            <p className="font-data text-sm">Buy {rates.data?.buy || "—"}</p>
            <p className="font-data text-sm">Sell {rates.data?.sell || "—"}</p>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader className="border-b pb-4">
            <h2 className="text-muted-foreground font-mono text-xs tracking-[0.14em] uppercase">
              Link
            </h2>
          </CardHeader>
          <CardContent className="pt-4">
            {address ? (
              <p className="font-data text-sm">
                {formatVoucherAddress(address)} ·{" "}
                {link.isError
                  ? "Unavailable"
                  : link.isPending
                    ? "Reading"
                    : link.data?.linked
                      ? link.data.phoneNumber || "Linked"
                      : "Not linked"}
              </p>
            ) : (
              <p className="text-muted-foreground font-data text-sm">—</p>
            )}
          </CardContent>
        </Card>
      </div>
      {address ? (
        accountError ? (
          <PageState title="Could not load cash" message={errorOf(accountError)} />
        ) : accountPending ? (
          <LoadingBlock rows={4} />
        ) : (
          <DataTable
            columns={columns}
            data={accountRows}
            emptyState={<EmptyState title="No cash movements" />}
          />
        )
      ) : null}
      <h2 className="text-muted-foreground font-mono text-xs tracking-[0.14em] uppercase">
        Recent
      </h2>
      {recentState.kind === "pending" ? (
        <LoadingBlock rows={4} />
      ) : recentState.kind === "error" ? (
        <PageState title="Could not load recent cash" message={recentState.message} />
      ) : (
        <>
          {recentState.kind === "stale" ? <StaleNotice message={recentState.message} /> : null}
          <DataTable
            columns={columns}
            data={recentRows}
            emptyState={<EmptyState title="No recent cash" />}
          />
        </>
      )}
    </div>
  );
}

function errorOf(error: unknown): string {
  return error instanceof Error ? error.message : "The cash ledger did not respond.";
}
