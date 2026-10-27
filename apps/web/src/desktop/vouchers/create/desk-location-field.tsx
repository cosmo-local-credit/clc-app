import type { LocationInput } from "@clc/core/features/location/logic";
import type { MapMarkerStyle } from "@clc/core/features/markers/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { Suspense } from "react";
import { RiSearchLine } from "react-icons/ri";
import { TbCurrentLocation } from "react-icons/tb";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { LocationMap } from "#/components/ui/location-map.lazy";
import { useLocationPicker } from "#/components/ui/use-location-picker";

/**
 * The location as one inline field: a place search beside "Use my location",
 * then a 260px map to drop or drag the pin. The phone picker's state, laid out
 * for a desktop form.
 */
export function DeskLocationField({
  value,
  onChange,
  error,
  markerStyle,
}: {
  value: LocationInput | undefined;
  onChange: (value: LocationInput | undefined) => void;
  error?: string;
  markerStyle: MapMarkerStyle;
}) {
  const { t } = useLingui();
  const picker = useLocationPicker({ value, onChange, error });
  const mapFallback = (
    <output className="block h-[260px] w-full border border-border bg-card">
      <span className="sr-only">
        <Trans>Loading location map</Trans>
      </span>
    </output>
  );

  return (
    <div className="grid gap-1.5">
      <label
        htmlFor="desk-location-search"
        className="flex items-center gap-1.5 text-sm font-medium"
      >
        <Trans>Location</Trans>
        <Badge size="sm" variant="outline" caps>
          <Trans>Required</Trans>
        </Badge>
      </label>
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <RiSearchLine
            aria-hidden="true"
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="desk-location-search"
            type="text"
            role="searchbox"
            autoComplete="off"
            placeholder={t`Search for a town or place`}
            value={picker.query}
            onChange={(event) => picker.search(event.target.value)}
            className="ps-9"
            aria-invalid={!!picker.shownError}
            aria-required
          />
          {picker.suggestions.length > 0 ? (
            <div
              role="listbox"
              className="absolute inset-x-0 top-full z-20 mt-1 border border-border bg-popover py-1"
            >
              {picker.suggestions.map((suggestion) => (
                <button
                  key={`${suggestion.address}-${suggestion.lat}-${suggestion.lng}`}
                  type="button"
                  role="option"
                  aria-selected="false"
                  className="block w-full truncate px-3 py-2 text-start text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                  onClick={() => picker.chooseSuggestion(suggestion)}
                >
                  {suggestion.address}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={picker.geolocation.request}
          disabled={picker.geoUnavailable}
          pending={picker.geoRequesting}
        >
          {picker.geoRequesting ? null : <TbCurrentLocation aria-hidden="true" />}
          {picker.geoUnavailable ? (
            <Trans>Location unavailable</Trans>
          ) : (
            <Trans>Use my location</Trans>
          )}
        </Button>
      </div>
      {picker.canRenderMap ? (
        <Suspense fallback={mapFallback}>
          <LocationMap
            lat={picker.pin?.lat ?? null}
            lng={picker.pin?.lng ?? null}
            interactive
            onLocationChange={picker.placePin}
            markerStyle={markerStyle}
            className="h-[260px]"
          />
        </Suspense>
      ) : (
        mapFallback
      )}
      {picker.searching ? (
        <p className="text-xs text-muted-foreground">
          <Trans>Searching places…</Trans>
        </p>
      ) : null}
      {picker.reversePending ? (
        <output className="text-xs text-muted-foreground">
          <Trans>Identifying location…</Trans>
        </output>
      ) : null}
      {picker.shownError ? <p className="text-xs text-destructive">{picker.shownError}</p> : null}
      {picker.geolocation.state.status === "error" ? (
        <p className="text-xs text-destructive">{picker.geolocation.state.message}</p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        <Trans>
          The exact pin will be public. Choose a safe public meeting place, not a private home.
        </Trans>
      </p>
    </div>
  );
}
