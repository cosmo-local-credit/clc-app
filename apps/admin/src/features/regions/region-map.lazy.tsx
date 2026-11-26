import { lazy, type ComponentProps, Suspense } from "react";

const RegionCoverageMap = lazy(() =>
  import("./region-coverage-map").then((module) => ({ default: module.RegionCoverageMap })),
);

export function RegionMap(props: ComponentProps<typeof RegionCoverageMap>) {
  if (!props.areas.length) return null;
  return (
    <Suspense
      fallback={
        <p role="status" className="border border-border bg-card p-4 text-sm text-muted-foreground">
          Loading region map…
        </p>
      }
    >
      <RegionCoverageMap {...props} />
    </Suspense>
  );
}
