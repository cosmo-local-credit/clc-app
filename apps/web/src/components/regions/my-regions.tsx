import { myRegionsQueryOptions } from "@clc/api/features/regions/queries";
import type { Region } from "@clc/core/features/regions/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { CatchBoundary } from "@tanstack/react-router";
import { lazy, Suspense, useState } from "react";
import { RiMap2Line } from "react-icons/ri";

import { ActionRow } from "#/components/ui/action-row";
import { Button } from "#/components/ui/button";
import { Spinner } from "#/components/ui/spinner";
import { regionsClient } from "#/lib/api/regions";

const RegionMap = lazy(() =>
  import("./region-map").then(({ RegionMap }) => ({ default: RegionMap })),
);

export function MyRegions({ viewer }: { viewer?: string }) {
  return viewer ? <AssignedRegions key={viewer.toLowerCase()} viewer={viewer} /> : <NoRegions />;
}

function AssignedRegions({ viewer }: { viewer: string }) {
  const query = useQuery(myRegionsQueryOptions(regionsClient, viewer));

  if (query.isError) {
    return (
      <div className="space-y-3 border border-border bg-card p-4">
        <p role="alert" className="text-muted-foreground text-sm">
          <Trans>We couldn't load your regions.</Trans>
        </p>
        <Button
          variant="outline"
          tap
          pending={query.isFetching}
          onClick={() => void query.refetch()}
        >
          <Trans>Try again</Trans>
        </Button>
      </div>
    );
  }

  // Do not show cached assignments while a new scope check is unresolved.
  if (query.isPending || query.isFetching) return <RegionsLoading />;
  const regions = query.data.filter((region) => region.active);
  return regions.length > 0 ? <RegionPicker regions={regions} /> : <NoRegions />;
}

function RegionsLoading() {
  return (
    <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
      <Spinner />
      <Trans>Loading…</Trans>
    </div>
  );
}

function NoRegions() {
  return (
    <p className="text-sm text-muted-foreground">
      <Trans>No active regions are assigned to you.</Trans>
    </p>
  );
}

function RegionPicker({ regions }: { regions: Region[] }) {
  const { t } = useLingui();
  const [selectedId, setSelectedId] = useState<string>();
  const selected = regions.find((region) => region.id === selectedId) ?? regions[0];
  return (
    <div className="space-y-4">
      <ul aria-label={t`Assigned regions`} className="border border-border bg-card">
        {regions.map((region) => (
          <li key={region.id} className="border-b border-border last:border-b-0">
            <ActionRow
              icon={<RiMap2Line className="size-4" aria-hidden="true" />}
              label={region.name}
              pressed={region.id === selected.id}
              className="aria-pressed:bg-muted"
              trailingIcon={false}
              onClick={() => setSelectedId(region.id)}
            />
          </li>
        ))}
      </ul>

      <CatchBoundary getResetKey={() => selected.id} errorComponent={RegionMapUnavailable}>
        <Suspense fallback={<RegionsLoading />}>
          <RegionMap region={selected} />
        </Suspense>
      </CatchBoundary>
    </div>
  );
}

function RegionMapUnavailable() {
  return (
    <p className="text-sm text-muted-foreground">
      <Trans>The map could not be loaded.</Trans>
    </p>
  );
}
