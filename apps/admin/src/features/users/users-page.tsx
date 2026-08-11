import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import { useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useState } from "react";
import { DataTable } from "#/components/admin/data-table";
import { EmptyState } from "#/components/admin/empty-state";
import { LoadingBlock } from "#/components/admin/loading-block";
import { PageHeader } from "#/components/admin/page-header";
import { PageState } from "#/components/admin/page-state";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { type KnownOperator, useKnownOperators } from "#/features/users/use-known-operators";

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

const columns: Array<ColumnDef<KnownOperator>> = [
  {
    accessorKey: "address",
    header: "Address",
    cell: ({ row }) => (
      <span className="font-data text-xs">
        {formatVoucherAddress(row.original.address as `0x${string}`)}
      </span>
    ),
  },
  {
    accessorKey: "poolCount",
    header: "Pools owned",
    cell: ({ row }) => <span className="font-data">{row.original.poolCount}</span>,
  },
  {
    id: "owns",
    header: "Owns",
    enableSorting: false,
    cell: ({ row }) => (
      <span className="truncate text-xs text-muted-foreground">
        {row.original.owns.join(", ") || "—"}
      </span>
    ),
  },
];

export function UsersPage() {
  const navigate = useNavigate();
  const { operators, isPending, isError, error } = useKnownOperators();
  const [lookup, setLookup] = useState("");

  const lookupValid = ADDRESS_PATTERN.test(lookup.trim());

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Pool owners"
        description="Addresses that own a pool in the current page, plus direct lookup by address. This is not a user or operator directory."
      />

      <Alert>
        <AlertTitle>Pool owners in this page — not a directory</AlertTitle>
        <AlertDescription>
          clc-core exposes no user-directory endpoint — accounts are only addressable one at a time.
          The table lists only addresses that own a pool in the page fetched below, so it is neither
          a complete user list nor a complete operator list. Use the lookup to inspect any address
          directly.
        </AlertDescription>
      </Alert>

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!lookupValid) return;
          void navigate({ to: "/users/$address", params: { address: lookup.trim() } });
        }}
      >
        <Input
          value={lookup}
          onChange={(event) => setLookup(event.target.value)}
          placeholder="0x…"
          aria-label="Look up an account by address"
          className="w-full max-w-md font-mono text-xs"
        />
        <Button type="submit" disabled={!lookupValid}>
          Look up
        </Button>
        {lookup.trim() !== "" && !lookupValid ? (
          <span className="text-xs text-destructive">Not a valid 40-character hex address.</span>
        ) : null}
      </form>

      {isPending ? (
        <LoadingBlock rows={6} />
      ) : isError ? (
        <PageState
          title="Could not load pool owners"
          message={error instanceof Error ? error.message : "Request failed."}
        />
      ) : (
        <DataTable
          columns={columns}
          data={operators}
          onRowClick={(operator) =>
            void navigate({ to: "/users/$address", params: { address: operator.address } })
          }
          emptyState={
            <EmptyState
              title="No pool owners in this page"
              description="No pool in this page has an owner address."
            />
          }
        />
      )}
    </div>
  );
}
