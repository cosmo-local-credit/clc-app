import {
  ADMIN_DISPATCH_STATUSES,
  ADMIN_OTX_TYPES,
  type AdminOTX,
} from "@clc/api/features/admin/client";
import { adminOTXQueryOptions } from "@clc/api/features/admin/queries";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { CopyButton } from "#/components/admin/copy-button";
import { DataTable } from "#/components/admin/data-table";
import { EmptyState } from "#/components/admin/empty-state";
import { ListToolbar } from "#/components/admin/list-toolbar";
import { LoadingBlock } from "#/components/admin/loading-block";
import { PageHeader } from "#/components/admin/page-header";
import { PageState } from "#/components/admin/page-state";
import { StaleNotice } from "#/components/admin/stale-notice";
import { StateBadge } from "#/components/admin/state-badge";
import { TablePagination } from "#/components/admin/table-pagination";
import {
  TransactionTypeBadge,
  transactionTypeSelectClass,
} from "#/components/admin/transaction-type-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select";
import { clcApi } from "#/lib/api";
import { termFilter } from "#/lib/catalog-filter";
import { explorerTxUrl } from "#/lib/explorer";
import { formatDateTime } from "#/lib/format";
import { filterSearch } from "#/lib/table-search";
import { useDataState } from "#/lib/use-data-state";
import { usePagedTable } from "#/lib/use-paged-table";
import { cn } from "#/lib/utils";
import type { OTXSearch } from "./transactions-search";

/** Base UI needs a value for "no filter"; the enums cannot contain it. */
const ANY = "any";

/**
 * Origin transactions: what clc-core's own signer put on the wire.
 *
 * The other two pages read the chain. This one reads our side of it, and the
 * difference is the point — a dispatch can sit at NO_GAS or LOW_NONCE forever
 * without ever appearing on chain, and that is precisely the failure an operator
 * comes here to find. It is also the only transaction page that keeps working
 * when the federation link is down, because it reads local tables.
 *
 * All three transaction tables use type and status badges for a consistent scan
 * path. OTX status needs the richer lifecycle treatment most: ten states, eight
 * of which never reached the network, are not something a glyph can carry.
 */
const columns: Array<ColumnDef<AdminOTX>> = [
  {
    accessorKey: "createdAt",
    header: "Created",
    cell: ({ row }) => (
      <span
        className="font-data text-xs"
        title={`Updated ${formatDateTime(row.original.updatedAt)}`}
      >
        {formatDateTime(row.original.createdAt)}
      </span>
    ),
  },
  {
    accessorKey: "otxType",
    header: "Type",
    cell: ({ row }) => (
      <TransactionTypeBadge type={row.original.otxType} kind="origin transaction" />
    ),
  },
  {
    id: "trackingId",
    header: "Tracking",
    enableSorting: false,
    // The correlation key across a deployment's whole OTX chain, and what an
    // operator pastes into /otx/track. It stays whole in the table so operators
    // can compare a visible row directly with a tracking ID they were given.
    cell: ({ row }) => (
      <span className="inline-flex items-center gap-1">
        <span className="font-data text-xs">{row.original.trackingId}</span>
        <CopyButton value={row.original.trackingId} label="Copy tracking ID" />
      </span>
    ),
  },
  {
    id: "signer",
    header: "Signer",
    enableSorting: false,
    // Not linked to an account screen: this is a clc-core keystore account, not
    // a user, so the account directory has nothing to say about it.
    cell: ({ row }) => (
      <span className="font-data text-xs" title={row.original.signer}>
        {formatVoucherAddress(row.original.signer as `0x${string}`)}
      </span>
    ),
  },
  {
    accessorKey: "nonce",
    header: "Nonce",
    // The replaced flag lives here because a nonce is what was replaced: two
    // rows sharing one nonce is the expected shape, not a duplicate.
    cell: ({ row }) => (
      <span className="inline-flex items-baseline gap-1.5">
        <span className="font-data text-xs">{row.original.nonce}</span>
        {row.original.replaced ? (
          <span className="text-muted-foreground font-mono text-[0.625rem] tracking-wide uppercase">
            replaced
          </span>
        ) : null}
      </span>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <StateBadge state={row.original.status} kind="dispatch" />,
  },
  {
    id: "txHash",
    header: "Tx",
    enableSorting: false,
    // The hash exists from the moment the transaction is signed, so a dispatch
    // that never reached the network has one the explorer has never seen.
    // Linking it would answer "no such transaction", which reads as data loss.
    cell: ({ row }) => {
      const short = formatVoucherAddress(row.original.txHash as `0x${string}`);
      const mined = row.original.status === "SUCCESS" || row.original.status === "REVERTED";
      if (!mined) {
        return (
          <span className="font-data text-muted-foreground text-xs" title="Not on chain yet">
            {short}
          </span>
        );
      }
      return (
        <a
          href={explorerTxUrl(row.original.txHash)}
          target="_blank"
          rel="noreferrer"
          className="font-data text-xs underline-offset-4 hover:underline"
        >
          {short}
          <span className="sr-only">on the block explorer</span>
        </a>
      );
    },
  },
];

export function OTXPage({ search }: { search: OTXSearch }) {
  const navigate = useNavigate();
  const term = termFilter(search.q ?? "").term;
  const query = useQuery(
    adminOTXQueryOptions(clcApi.admin, {
      perPage: search.perPage,
      cursor: search.cursor,
      next: search.dir === undefined ? undefined : search.dir === "next",
      type: search.type,
      status: search.status,
      ...(term ? { q: term } : {}),
    }),
  );

  const rows = query.data?.otx ?? [];
  const listState = useDataState(query, (page) => page.otx.length === 0);
  const table = usePagedTable({
    search,
    page: query.data,
    navigate: (next) => void navigate({ to: "/transactions/otx", search: next }),
  });
  const patch = (next: Partial<OTXSearch>) =>
    void navigate({ to: "/transactions/otx", search: filterSearch(search, next) });

  const filtered = Boolean(search.type || search.status || term);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Origin transactions"
        // Thirteen types and ten statuses: chips would be a wall, so these are
        // the console's only two select filters.
        actions={
          <ListToolbar
            search={search.q}
            onSearchChange={(q) => patch({ q: q || undefined })}
            searchPlaceholder="Tracking ID or transaction hash"
            searchClassName="w-72"
          >
            <EnumSelect
              label="Type"
              anyLabel="All types"
              value={search.type}
              options={ADMIN_OTX_TYPES}
              colorTypes
              onChange={(type) => patch({ type })}
            />
            <EnumSelect
              label="Status"
              anyLabel="All statuses"
              value={search.status}
              options={ADMIN_DISPATCH_STATUSES}
              onChange={(status) => patch({ status })}
            />
          </ListToolbar>
        }
      />

      {listState.kind === "pending" ? (
        <LoadingBlock rows={8} />
      ) : listState.kind === "error" ? (
        <PageState title="Could not load origin transactions" message={listState.message} />
      ) : (
        <>
          {listState.kind === "stale" ? <StaleNotice message={listState.message} /> : null}
          <DataTable
            columns={columns}
            data={rows}
            rowClassName="h-12"
            sorting={table.sorting}
            onSortChange={table.onSortChange}
            emptyState={
              <EmptyState
                title={filtered ? "No matching transactions" : "No origin transactions"}
                description={
                  filtered
                    ? "No dispatch matches this filter."
                    : "This service has signed nothing yet."
                }
              />
            }
            footer={
              <TablePagination
                search={search}
                dropped={0}
                isFirstPage={table.isFirstPage}
                mightHaveMore={table.mightHaveMore}
                isFetching={query.isFetching}
                onFirstPage={table.onFirstPage}
                onPreviousPage={table.onPreviousPage}
                onNextPage={table.onNextPage}
                onPageSize={table.onPageSize}
              />
            }
          />
        </>
      )}
    </div>
  );
}

function EnumSelect<TValue extends string>({
  label,
  anyLabel,
  value,
  options,
  colorTypes = false,
  onChange,
}: {
  label: string;
  anyLabel: string;
  value: TValue | undefined;
  options: readonly TValue[];
  colorTypes?: boolean;
  onChange: (value: TValue | undefined) => void;
}) {
  // Base UI renders the raw value in the trigger until the popup has mounted,
  // so the closed control would read "any" until first opened. `items` gives it
  // the labels up front.
  const items = [
    { value: ANY, label: anyLabel },
    ...options.map((option) => ({ value: option, label: option })),
  ];
  const selectedLabel = value ?? anyLabel;

  return (
    <Select
      items={items}
      value={value ?? ANY}
      onValueChange={(next) => {
        if (next == null) return;
        onChange(next === ANY ? undefined : (next as TValue));
      }}
    >
      <SelectTrigger
        size="default"
        className={cn("w-40 px-2.5", colorTypes && transactionTypeSelectClass(value))}
        aria-label={label}
        title={selectedLabel}
      >
        <SelectValue className="min-w-0 truncate font-mono text-xs" />
      </SelectTrigger>
      <SelectContent align="start">
        {items.map((item) => (
          <SelectItem
            key={item.value}
            value={item.value}
            className={cn(
              "font-mono text-xs",
              colorTypes && transactionTypeSelectClass(item.value === ANY ? undefined : item.value),
            )}
          >
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
