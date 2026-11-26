import { myRegionsQueryOptions } from "@clc/api/features/regions/queries";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { LoadingBlock } from "#/components/admin/loading-block";
import { PageHeader } from "#/components/admin/page-header";
import { Button } from "#/components/ui/button";
import { useAdminSignOut } from "#/features/auth/admin-session";
import { clcApi } from "#/lib/api";
import { BRAND_ICON_BASE } from "#/lib/brand";
import { errorMessage } from "#/lib/data-state";
import { RegionMap } from "./region-map.lazy";

/** Regional staff never mount the global sidebar, palette, or route outlet. */
export function RegionalWorkspace({ viewer }: { viewer: string }) {
  const query = useQuery({
    ...myRegionsQueryOptions(clcApi.regions, viewer),
    refetchOnWindowFocus: "always",
  });
  const signOut = useAdminSignOut();
  const [selection, setSelection] = useState<string | null>(null);
  const areas = query.data;
  const selected = areas?.find((region) => region.id === selection);
  return (
    <>
      <header className="flex h-14 items-center justify-between border-b border-border bg-card px-4">
        <span className="flex items-center gap-2 font-heading font-semibold">
          <img src={`${BRAND_ICON_BASE}/logo.svg`} alt="" className="size-6" />
          CLC Admin
        </span>
        <Button
          type="button"
          variant="outline"
          disabled={signOut.isPending}
          onClick={() => signOut.mutate()}
        >
          {signOut.isPending ? "Signing out…" : "Sign out"}
        </Button>
      </header>
      <main className="mx-auto flex max-w-5xl flex-col gap-5 p-4 md:p-6">
        <PageHeader title="My regions" description="Regional administrator access" />
        {query.isError ? (
          <div role="alert" className="space-y-3 border border-border bg-card p-4">
            <p>Couldn’t verify your regions. {errorMessage(query.error)}</p>
            <Button
              variant="outline"
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
            >
              Retry
            </Button>
          </div>
        ) : !areas ? (
          <LoadingBlock rows={3} />
        ) : !areas.length ? (
          <p className="border border-border bg-card p-4 text-sm">
            No active regions are assigned to you.
          </p>
        ) : (
          <>
            <ul
              aria-label="Your regions"
              className="divide-y divide-border border border-border bg-card"
            >
              {areas.map((region) => (
                <li key={region.id} className="flex items-center justify-between gap-2 p-3">
                  <Button
                    variant={selected?.id === region.id ? "secondary" : "ghost"}
                    aria-pressed={selected?.id === region.id}
                    onClick={() => setSelection(region.id)}
                  >
                    {region.name}
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {region.countryCode ?? "Custom boundary"}
                  </span>
                </li>
              ))}
            </ul>
            <RegionMap
              areas={areas}
              highlighted={selected ? [selected.id] : []}
              onSelect={setSelection}
            />
          </>
        )}
      </main>
    </>
  );
}
