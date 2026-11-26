import { adminRegionsQueryOptions, regionKeys } from "@clc/api/features/regions/queries";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import type { Region } from "@clc/core/features/regions/logic";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { DataTable } from "#/components/admin/data-table";
import { LoadingBlock } from "#/components/admin/loading-block";
import { PageHeader } from "#/components/admin/page-header";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { useAdminSession } from "#/features/auth/admin-session";
import { clcApi } from "#/lib/api";
import { errorMessage } from "#/lib/data-state";
import { RegionAssignments } from "./region-assignments";
import { RegionEditor } from "./region-editor";
import { RegionMap } from "./region-map.lazy";

const EMPTY_REGIONS: Region[] = [];

export function RegionsPage() {
  const session = useAdminSession();
  if (session.status !== "authenticated") return null;
  return (
    <ManageRegions
      key={session.operator.address.toLowerCase()}
      viewer={session.operator.address}
      superadmin={session.operator.role === "SUPERADMIN"}
    />
  );
}

function ManageRegions({ viewer, superadmin }: { viewer: string; superadmin: boolean }) {
  const queryClient = useQueryClient();
  const query = useQuery(adminRegionsQueryOptions(clcApi.regions, viewer));
  const regions = query.data ?? EMPTY_REGIONS;
  const [selection, setSelection] = useState<string>();
  const [search, setSearch] = useState("");
  const [staffFilter, setStaffFilter] = useState("");
  // undefined = closed, null = new region. Existing edits keep their original
  // revision even if a background fetch receives a concurrent change.
  const [editor, setEditor] = useState<Region | null>();
  const staff = useMemo(() => {
    const assignments = new Map<string, Region["assignedAdmins"][number]>();
    for (const region of regions) {
      for (const user of region.assignedAdmins) assignments.set(user.address.toLowerCase(), user);
    }
    return [...assignments.entries()].sort(([, a], [, b]) =>
      (a.username ?? a.address).localeCompare(b.username ?? b.address),
    );
  }, [regions]);
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return regions.filter(
      (region) =>
        (region.name.toLowerCase().includes(q) || region.countryCode?.toLowerCase().includes(q)) &&
        (!staffFilter ||
          region.assignedAdmins.some((admin) => admin.address.toLowerCase() === staffFilter)),
    );
  }, [regions, search, staffFilter]);
  const selected = visible.find((region) => region.id === selection);
  const highlighted = useMemo(
    () => (selected ? [selected.id] : staffFilter ? visible.map((item) => item.id) : []),
    [selected, staffFilter, visible],
  );
  const columns = useMemo<ColumnDef<Region>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Region",
        cell: ({ row: { original } }) => (
          <Button
            variant="ghost"
            aria-pressed={selection === original.id}
            onClick={() => setSelection(original.id)}
          >
            {original.name}
          </Button>
        ),
      },
      {
        accessorKey: "countryCode",
        header: "Boundary source",
        cell: ({ row: { original } }) => original.countryCode ?? "Custom boundary",
      },
      {
        accessorKey: "active",
        header: "Status",
        cell: ({ row: { original } }) => (original.active ? "Active" : "Inactive"),
      },
      {
        id: "staff",
        header: "Regional admins",
        meta: { align: "right" },
        cell: ({ row: { original } }) => (
          <span className="font-data">{original.assignedAdmins.length}</span>
        ),
      },
    ],
    [selection],
  );

  function updateRegionCache(updated: Region) {
    queryClient.setQueryData<Region[]>(regionKeys.admin(viewer), (previous) =>
      [...(previous ?? []).filter((region) => region.id !== updated.id), updated].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    );
    void queryClient.invalidateQueries({ queryKey: regionKeys.admin(viewer), exact: true });
  }

  function onEditorSave(updated: Region) {
    setEditor(undefined);
    setSearch("");
    setStaffFilter("");
    setSelection(updated.id);
    updateRegionCache(updated);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Regions"
        description="Define regional boundaries and optionally assign regional admins."
        actions={
          <Button
            type="button"
            disabled={editor !== undefined || query.isPending || query.isError}
            onClick={() => setEditor(null)}
          >
            Add region
          </Button>
        }
      />
      {query.isError ? (
        <div role="alert" className="space-y-3 border border-border bg-card p-4">
          <p>Couldn’t load regions. {errorMessage(query.error)}</p>
          <Button
            variant="outline"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            Retry
          </Button>
        </div>
      ) : query.isPending ? (
        <LoadingBlock rows={4} />
      ) : (
        <>
          {editor !== undefined ? (
            <RegionEditor
              key={editor?.id ?? "new"}
              viewer={viewer}
              region={editor ?? undefined}
              onSaved={onEditorSave}
              onCancel={() => setEditor(undefined)}
            />
          ) : null}
          <div className="grid items-start gap-4 xl:grid-cols-2">
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-medium">
                  Find a region
                  <Input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-medium">
                  Show regions assigned to
                  <select
                    className="h-9 w-full border border-input bg-card px-3 text-sm text-foreground"
                    value={staffFilter}
                    onChange={(event) => {
                      setStaffFilter(event.target.value);
                      setSelection(undefined);
                    }}
                  >
                    <option value="">Everyone</option>
                    {staff.map(([key, account]) => (
                      <option key={key} value={key}>
                        {account.username ?? formatVoucherAddress(account.address as `0x${string}`)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <DataTable
                data={visible}
                columns={columns}
                onRowClick={(region) => setSelection(region.id)}
                emptyState={
                  <p className="border border-border bg-card p-4 text-sm text-muted-foreground">
                    {regions.length
                      ? "No regions match these filters."
                      : "No regions have been created."}
                  </p>
                }
              />
            </div>
            {visible.length ? (
              <RegionMap areas={visible} highlighted={highlighted} onSelect={setSelection} />
            ) : null}
          </div>
          {selected && editor === undefined ? (
            <section
              aria-labelledby="region-details-heading"
              className="space-y-4 border border-border bg-card p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 id="region-details-heading">{selected.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {selected.countryCode ?? "Custom boundary"}
                  </p>
                </div>
                <Button variant="outline" onClick={() => setEditor(selected)}>
                  Edit region
                </Button>
              </div>
              <p className="text-sm">
                Pool listings · {selected.poolApproval ? "Approval required" : "Automatic"}
              </p>
              <RegionAssignments
                key={selected.id}
                region={selected}
                superadmin={superadmin}
                onSaved={updateRegionCache}
              />
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
