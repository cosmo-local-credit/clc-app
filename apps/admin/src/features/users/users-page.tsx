import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import { Link, useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";

import type { AdminUser, AdminUserStatus } from "@clc/api/features/admin/client";
import { DataTable } from "#/components/admin/data-table";
import { EmptyState } from "#/components/admin/empty-state";
import { ListToolbar } from "#/components/admin/list-toolbar";
import { LoadingBlock } from "#/components/admin/loading-block";
import { PageHeader } from "#/components/admin/page-header";
import { PageState } from "#/components/admin/page-state";
import { StaleNotice } from "#/components/admin/stale-notice";
import { TablePagination } from "#/components/admin/table-pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select";
import { termFilter } from "#/lib/catalog-filter";
import { DEFAULT_PAGE_SIZE, filterSearch } from "#/lib/table-search";
import { useDataState } from "#/lib/use-data-state";
import { usePagedTable } from "#/lib/use-paged-table";
import type { AccountSearch } from "./account-search";
import { useAdminUsers } from "./use-admin-users";

const STATUS_OPTIONS: Array<{ value: "ALL" | AdminUserStatus; label: string }> = [
  { value: "ALL", label: "All" },
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
];

/**
 * Identity, contact, and approval status.
 *
 * Per-account limits and the join date stay on the account screen, next to the
 * controls that change them.
 */
const columns: Array<ColumnDef<AdminUser>> = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <span className="truncate">{row.original.name || <Muted>unnamed</Muted>}</span>
    ),
  },
  {
    accessorKey: "ethereumAddress",
    header: "Address",
    cell: ({ row }) => (
      <Link
        to="/users/$address"
        params={{ address: row.original.ethereumAddress }}
        search={{ tab: "transactions", perPage: DEFAULT_PAGE_SIZE }}
        className="font-data text-xs underline-offset-4 hover:underline"
        // The row is clickable too; this stops the row handler firing as well.
        onClick={(event) => event.stopPropagation()}
      >
        {formatVoucherAddress(row.original.ethereumAddress as `0x${string}`)}
      </Link>
    ),
  },
  {
    accessorKey: "email",
    header: "Email",
    cell: ({ row }) => (
      <span className="truncate">{row.original.email || <Muted>none</Muted>}</span>
    ),
  },
  {
    accessorKey: "phone",
    header: "Phone",
    // Stored E.164, so the country code is already part of the number.
    cell: ({ row }) => (
      <span className="font-data text-xs">{row.original.phone || <Muted>none</Muted>}</span>
    ),
  },
  {
    accessorKey: "country",
    header: "Country",
    // An ISO 3166-1 alpha-2 code, as clc-core validates it on the signup profile.
    cell: ({ row }) => (
      <span className="font-mono text-xs uppercase">
        {row.original.country || <Muted>—</Muted>}
      </span>
    ),
  },
  {
    accessorKey: "role",
    header: "Role",
    cell: ({ row }) => <span className="font-mono text-xs">{row.original.role}</span>,
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <span className="font-mono text-xs uppercase">{row.original.status}</span>,
  },
];

export function UsersPage({ search }: { search: AccountSearch }) {
  const navigate = useNavigate();
  // The term goes to the endpoint, so a search covers the whole directory rather
  // than the page in hand. `searched` is read back off the normalized term
  // because clc-core rejects one under two characters: below that nothing is
  // sent, and the empty state must describe the request that was made.
  const term = termFilter(search.q ?? "").term;
  const usersQuery = useAdminUsers({
    perPage: search.perPage,
    cursor: search.cursor,
    next: search.dir === undefined ? undefined : search.dir === "next",
    ...(term ? { q: term } : {}),
    ...(search.status ? { status: search.status } : {}),
  });

  const users = usersQuery.data?.users ?? [];
  const listState = useDataState(usersQuery, (page) => page.users.length === 0);
  const table = usePagedTable({
    search,
    page: usersQuery.data,
    navigate: (next) => void navigate({ to: "/users", search: next }),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Accounts"
        actions={
          <>
            <ListToolbar
              search={search.q}
              onSearchChange={(value) =>
                void navigate({
                  to: "/users",
                  search: filterSearch(search, { q: value || undefined }),
                })
              }
              searchPlaceholder="Name, email, phone, address"
            />
            <Select
              items={STATUS_OPTIONS}
              value={search.status ?? "ALL"}
              onValueChange={(value) =>
                void navigate({
                  to: "/users",
                  search: filterSearch(search, {
                    status:
                      value === "PENDING" || value === "APPROVED" || value === "REJECTED"
                        ? value
                        : undefined,
                  }),
                })
              }
            >
              <SelectTrigger size="default" className="w-40 px-2.5" aria-label="Status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
      />

      {listState.kind === "pending" ? (
        <LoadingBlock rows={6} />
      ) : listState.kind === "error" ? (
        <PageState title="Could not load accounts" message={listState.message} />
      ) : (
        <>
          {listState.kind === "stale" ? <StaleNotice message={listState.message} /> : null}
          <DataTable
            columns={columns}
            data={users}
            rowClassName="h-12"
            sorting={table.sorting}
            onSortChange={table.onSortChange}
            onRowClick={(user) =>
              void navigate({
                to: "/users/$address",
                params: { address: user.ethereumAddress },
                search: { tab: "transactions", perPage: DEFAULT_PAGE_SIZE },
              })
            }
            emptyState={<EmptyState title={term ? "No matching accounts" : "No accounts"} />}
            footer={
              <TablePagination
                search={search}
                dropped={0}
                isFirstPage={table.isFirstPage}
                mightHaveMore={table.mightHaveMore}
                isFetching={usersQuery.isFetching}
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

function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}
