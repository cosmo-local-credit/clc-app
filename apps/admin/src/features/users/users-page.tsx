/**
 * The account directory.
 *
 * Reads `/api/v2/admin/users`, which returns **every** account rather than a page
 * of them, so there are no pagination controls and the count is stated as a total
 * — the one case in this console where a figure is not a page sample. If that
 * endpoint gains cursor parameters, this is where paging goes, alongside the
 * search-param helpers the other tables already use.
 */

import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import { Link, useNavigate } from "@tanstack/react-router";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { useState } from "react";
import { toast } from "sonner";

import type { AdminUser } from "@clc/api/features/admin/client";
import { DataTable } from "#/components/admin/data-table";
import { EmptyState } from "#/components/admin/empty-state";
import { LoadingBlock } from "#/components/admin/loading-block";
import { PageHeader } from "#/components/admin/page-header";
import { PageState } from "#/components/admin/page-state";
import { StateBadge } from "#/components/admin/state-badge";
import { Button } from "#/components/ui/button";
import { formatDateTime } from "#/lib/format";
import { useApproveUser, useAdminUsers, useRejectUser } from "./use-admin-users";
import { USER_STATUSES, type UsersSearch } from "./users-search";

export function UsersPage({ search }: { search: UsersSearch }) {
  const navigate = useNavigate();
  const usersQuery = useAdminUsers(search.status);
  const approve = useApproveUser();
  const reject = useRejectUser();

  // Which row has a mutation in flight, so only its buttons show the busy state.
  const [pendingAddress, setPendingAddress] = useState<string | null>(null);

  const sorting: SortingState = search.sort ? [{ id: search.sort, desc: !!search.desc }] : [];

  async function runAction(action: "approve" | "reject", user: AdminUser) {
    setPendingAddress(user.ethereumAddress);
    const mutation = action === "approve" ? approve : reject;
    try {
      await mutation.mutateAsync(user.ethereumAddress);
      toast.success(
        `${user.name || formatVoucherAddress(user.ethereumAddress as `0x${string}`)} ${
          action === "approve" ? "approved" : "rejected"
        }.`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Could not ${action} this account.`);
    } finally {
      setPendingAddress(null);
    }
  }

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
        <span className="truncate text-xs">{row.original.email || <Muted>none</Muted>}</span>
      ),
    },
    {
      accessorKey: "role",
      header: "Role",
      cell: ({ row }) => <span className="font-data text-xs">{row.original.role}</span>,
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StateBadge state={row.original.status} kind="account" />,
    },
    {
      id: "limits",
      header: "Pools / vouchers",
      enableSorting: false,
      cell: ({ row }) => (
        <span className="font-data text-xs">
          {row.original.maxPools} / {row.original.maxTokens}
        </span>
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Joined",
      cell: ({ row }) => (
        <span className="font-data text-xs">{formatDateTime(row.original.createdAt)}</span>
      ),
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => {
        const user = row.original;
        const busy = pendingAddress === user.ethereumAddress;
        return (
          <div className="flex justify-end gap-1" onClick={(event) => event.stopPropagation()}>
            {user.status !== "APPROVED" ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void runAction("approve", user)}
              >
                Approve
              </Button>
            ) : null}
            {user.status !== "REJECTED" ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => void runAction("reject", user)}
              >
                Reject
              </Button>
            ) : null}
          </div>
        );
      },
    },
  ];

  const users = usersQuery.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Accounts"
        description="Every CLC account, with approval state and per-account limits. Approving or rejecting here takes effect immediately."
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusFilter
          active={search.status === undefined}
          onSelect={() => void navigate({ to: "/users", search: { ...search, status: undefined } })}
        >
          All
        </StatusFilter>
        {USER_STATUSES.map((status) => (
          <StatusFilter
            key={status}
            active={search.status === status}
            onSelect={() => void navigate({ to: "/users", search: { ...search, status } })}
          >
            {status.charAt(0) + status.slice(1).toLowerCase()}
          </StatusFilter>
        ))}
      </div>

      {usersQuery.isPending ? (
        <LoadingBlock rows={6} />
      ) : usersQuery.isError ? (
        <PageState
          title="Could not load accounts"
          message={usersQuery.error instanceof Error ? usersQuery.error.message : "Request failed."}
        />
      ) : (
        <>
          <DataTable
            columns={columns}
            data={users}
            sorting={sorting}
            // DataTable reports the activated column id, not a SortingState:
            // re-clicking the active column flips direction, a new column starts
            // ascending.
            onSortChange={(columnId) => {
              const flip = search.sort === columnId && !search.desc;
              void navigate({
                to: "/users",
                search: { ...search, sort: columnId, desc: flip },
              });
            }}
            onRowClick={(user) =>
              void navigate({ to: "/users/$address", params: { address: user.ethereumAddress } })
            }
            emptyState={
              <EmptyState
                title={search.status ? `No ${search.status.toLowerCase()} accounts` : "No accounts"}
                description={
                  search.status
                    ? "No account is in this approval state."
                    : "The backend returned no accounts."
                }
              />
            }
          />
          {/* A total, not a sample: this endpoint returns every row. Sorting is
              client-side, which is exact here for the same reason. */}
          <p className="font-data text-muted-foreground text-xs">
            {users.length} {users.length === 1 ? "account" : "accounts"}
            {search.status ? ` with status ${search.status}` : " in total"}
          </p>
        </>
      )}
    </div>
  );
}

function StatusFilter({
  active,
  onSelect,
  children,
}: {
  active: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button size="sm" variant={active ? "default" : "outline"} onClick={onSelect}>
      {children}
    </Button>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}
