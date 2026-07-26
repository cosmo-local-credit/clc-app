import { Trans, useLingui } from "@lingui/react/macro";
import { Suspense, useCallback, useMemo, useState, type ReactNode } from "react";
import { RiFocus3Line, RiListUnordered, RiMapPinLine } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { useBrowserGeolocation } from "#/lib/use-browser-geolocation";
import type { MarketLocation, MarketLocationKind } from "./market-data";
import { MarketMap } from "./market-map.lazy";

export function MarketPage({ onboardingBanner }: { onboardingBanner?: ReactNode }) {
  const { t } = useLingui();
  const geolocation = useBrowserGeolocation({ autoRequestIfGranted: true });
  // Start with nothing selected: the newest catalog row may be anywhere in the
  // world and must not pull the resolved camera to an arbitrary location.
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);

  const locations: MarketLocation[] = useMemo(() => [], []);
  const selectedLocation = useMemo(
    () => locations.find((location) => location.id === selectedLocationId) ?? null,
    [locations, selectedLocationId],
  );

  const userLocation =
    geolocation.state.status === "granted"
      ? { lat: geolocation.state.lat, lng: geolocation.state.lng }
      : null;
  const locationButtonLabel =
    geolocation.state.status === "requesting"
      ? t`Finding location`
      : geolocation.state.status === "denied"
        ? t`Location denied`
        : geolocation.state.status === "unavailable"
          ? t`Location unavailable`
          : t`Use current location`;

  const handleSelectLocation = useCallback((id: string) => {
    setSelectedLocationId(id);
  }, []);

  return (
    <main className="relative h-[100svh] overflow-hidden bg-card">
      <Suspense
        fallback={<div className="market-map-fallback absolute inset-0 h-full w-full bg-card" />}
      >
        <MarketMap
          locations={locations}
          selectedLocationId={selectedLocationId}
          camera={null}
          userLocation={userLocation}
          onSelectLocation={handleSelectLocation}
          className="absolute inset-0 h-full w-full"
        />
      </Suspense>

      {onboardingBanner}

      {selectedLocation ? (
        <MarketPreview location={selectedLocation} offsetForBanner={!!onboardingBanner} />
      ) : null}

      <div className="absolute right-4 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-20 flex">
        <Button
          size="icon-lg"
          className="h-11 w-11 bg-foreground text-background hover:bg-foreground/90 disabled:bg-foreground disabled:text-background/70"
          aria-label={locationButtonLabel}
          disabled={
            geolocation.state.status === "requesting" ||
            geolocation.state.status === "denied" ||
            geolocation.state.status === "unavailable"
          }
          onClick={geolocation.request}
        >
          <RiFocus3Line className="size-5" aria-hidden="true" />
        </Button>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-20 flex justify-center px-6">
        <Button className="pointer-events-auto h-11 px-5">
          <RiListUnordered className="mr-2 size-4" aria-hidden="true" />
          <Trans>Browse all</Trans>
        </Button>
      </div>
    </main>
  );
}

function useKindLabel(kind: MarketLocationKind): string {
  const { t } = useLingui();
  switch (kind) {
    case "goods":
      return t`Goods`;
    case "services":
      return t`Services`;
    case "voucher":
      return t`Voucher`;
  }
}

function MarketPreview({
  location,
  offsetForBanner,
}: {
  location: MarketLocation;
  offsetForBanner: boolean;
}) {
  const kindLabel = useKindLabel(location.kind);
  return (
    // Not a button: there is no voucher-detail destination yet, and an inert
    // focusable control announced as actionable is worse than plain text.
    <section
      aria-label={location.name}
      className={[
        "absolute inset-x-4 z-20 flex items-center gap-3 border border-border bg-card px-4 py-3 text-left",
        offsetForBanner
          ? "top-[calc(env(safe-area-inset-top)+3rem)]"
          : "top-[calc(env(safe-area-inset-top)+1rem)]",
      ].join(" ")}
    >
      <RiMapPinLine className="size-5 shrink-0 text-primary" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block truncate font-heading font-semibold text-sm">{location.name}</span>
        <span className="mt-1 flex items-center gap-2">
          <span className="inline-flex border border-border bg-background px-1.5 py-0.5 font-medium text-[0.6875rem] text-muted-foreground">
            {kindLabel}
          </span>
          {location.locationName ? (
            <span className="truncate text-muted-foreground text-xs">{location.locationName}</span>
          ) : null}
        </span>
      </span>
    </section>
  );
}
