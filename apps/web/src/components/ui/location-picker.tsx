import type { LocationInput } from "@clc/core/features/location/logic";
import type { MapMarkerStyle } from "@clc/core/features/markers/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { Suspense } from "react";
import { TbCurrentLocation } from "react-icons/tb";

import { Input } from "#/components/ui/input";
import { Spinner } from "#/components/ui/spinner";
import { useLocationPicker } from "#/components/ui/use-location-picker";
import type { FixedResourceMarkerKind } from "#/components/vouchers/marker-style-picker";
import { cn } from "#/lib/utils";
import { LocationMap } from "./location-map.lazy";

type LocationPickerProps = {
  /** The country is only ever produced by the picker, so a stored place may omit it. */
  value: (Omit<LocationInput, "country"> & { country?: string }) | undefined;
  onChange: (value: LocationInput | undefined) => void;
  error?: string;
  label?: string;
  markerStyle?: MapMarkerStyle;
  markerResource?: FixedResourceMarkerKind;
  cameraHint?: { lat: number; lng: number; zoom: number } | null;
  required?: boolean;
  /**
   * The screen is about the location alone and already says so: the label is
   * kept for screen readers, and the map grows into the height the screen
   * gives it instead of its fixed 208px.
   */
  fill?: boolean;
};

export function LocationPicker({
  value,
  onChange,
  error,
  label,
  markerStyle,
  markerResource,
  cameraHint,
  required,
  fill = false,
}: LocationPickerProps) {
  const { t } = useLingui();
  const {
    query,
    search,
    suggestions,
    chooseSuggestion,
    searching,
    pin,
    placePin,
    reversePending,
    shownError,
    canRenderMap,
    geolocation,
    geoUnavailable,
    geoRequesting,
  } = useLocationPicker({ value, onChange, error });
  const mapHeight = fill ? "h-auto min-h-36 flex-1" : "h-52";

  return (
    <div className={fill ? "flex min-h-0 flex-1 flex-col gap-3" : "space-y-3"}>
      <div className="relative">
        <label
          htmlFor="location-search"
          className={fill ? "sr-only" : "flex items-baseline gap-2 font-medium text-sm"}
        >
          <span>{label ?? <Trans>Location</Trans>}</span>
          {required ? (
            <span aria-hidden="true" className="font-normal text-destructive text-xs">
              <Trans>Required</Trans>
            </span>
          ) : null}
        </label>
        <div className={fill ? "relative" : "relative mt-1.5"}>
          <Input
            id="location-search"
            type="text"
            role="searchbox"
            autoComplete="off"
            placeholder={t`Search for a town or place`}
            value={query}
            onChange={(event) => search(event.target.value)}
            className="bg-card pe-10"
            aria-invalid={!!shownError}
            aria-required={required || undefined}
          />
          <button
            type="button"
            className="absolute top-1/2 end-1 flex size-7 -translate-y-1/2 items-center justify-center rounded-none bg-primary text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:bg-muted disabled:text-muted-foreground"
            onClick={geolocation.request}
            disabled={geoUnavailable || geoRequesting}
            aria-busy={geoRequesting || undefined}
            aria-label={geoUnavailable ? t`Location unavailable` : t`Use my location`}
          >
            {geoRequesting ? <Spinner /> : <TbCurrentLocation className="size-4" />}
          </button>
        </div>

        {suggestions.length > 0 ? (
          <div
            role="listbox"
            className="absolute z-50 mt-1 w-full rounded-none border border-border bg-card"
          >
            {suggestions.map((suggestion) => (
              <button
                key={`${suggestion.address}-${suggestion.lat}-${suggestion.lng}`}
                type="button"
                role="option"
                aria-selected="false"
                className="block w-full px-3 py-2 text-start text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                onClick={() => chooseSuggestion(suggestion)}
              >
                {suggestion.address}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {searching ? (
        <p className="text-muted-foreground text-xs">
          <Trans>Searching places…</Trans>
        </p>
      ) : null}

      {canRenderMap ? (
        <Suspense
          fallback={
            <output className={cn("block w-full border border-border bg-card", mapHeight)}>
              <span className="sr-only">
                <Trans>Loading location map</Trans>
              </span>
            </output>
          }
        >
          <LocationMap
            lat={pin?.lat ?? null}
            lng={pin?.lng ?? null}
            cameraHint={cameraHint}
            interactive
            onLocationChange={placePin}
            markerStyle={markerStyle}
            markerResource={markerResource}
            className={fill ? mapHeight : undefined}
          />
        </Suspense>
      ) : (
        <output className={cn("block w-full border border-border bg-card", mapHeight)}>
          <span className="sr-only">
            <Trans>Loading location map</Trans>
          </span>
        </output>
      )}

      {reversePending ? (
        <output className="text-muted-foreground text-sm">
          <Trans>Identifying location…</Trans>
        </output>
      ) : null}

      {shownError ? <p className="text-destructive text-xs">{shownError}</p> : null}

      {geolocation.state.status === "error" ? (
        <p className="text-destructive text-xs">{geolocation.state.message}</p>
      ) : null}
    </div>
  );
}
