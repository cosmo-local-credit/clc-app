import type { LocationInput } from "@clc/core/features/location/logic";
import { locationSchema } from "@clc/core/features/location/logic";
import type { MarkerStyle } from "@clc/core/features/markers/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { TbCurrentLocation } from "react-icons/tb";

import { Input } from "#/components/ui/input";
import { Spinner } from "#/components/ui/spinner";
import type { GeocodeSuggestion } from "#/lib/geo-client";
import { reverseLocation, searchLocations } from "#/lib/geo-client";
import { useBrowserGeolocation } from "#/lib/use-browser-geolocation";

import { LocationMap } from "./location-map.lazy";

type LocationPickerProps = {
  /** The country is only ever produced by the picker, so a stored place may omit it. */
  value: (Omit<LocationInput, "country"> & { country?: string }) | undefined;
  onChange: (value: LocationInput | undefined) => void;
  error?: string;
  label?: string;
  markerStyle?: MarkerStyle;
  required?: boolean;
};

type PlacePinOptions = {
  locationNameHint?: string;
  clearSuggestions?: boolean;
  updateSearchInput?: boolean;
};

export function LocationPicker({
  value,
  onChange,
  error,
  label,
  markerStyle,
  required,
}: LocationPickerProps) {
  const { t } = useLingui();
  const [query, setQuery] = useState({ text: value?.locationName ?? "", shouldSearch: false });
  const [suggestions, setSuggestions] = useState<GeocodeSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(
    value ? { lat: value.lat, lng: value.lng } : null,
  );
  const [reversePending, setReversePending] = useState(false);
  const [reverseError, setReverseError] = useState<string | null>(null);
  const [canRenderMap, setCanRenderMap] = useState(false);
  const searchAbortRef = useRef<AbortController | null>(null);
  const reverseAbortRef = useRef<AbortController | null>(null);
  const reverseRequestRef = useRef(0);
  const onChangeRef = useRef(onChange);
  const geolocation = useBrowserGeolocation();
  const geoStatus = geolocation.state.status;
  const geoLat = geoStatus === "granted" ? geolocation.state.lat : null;
  const geoLng = geoStatus === "granted" ? geolocation.state.lng : null;

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!value && reverseAbortRef.current) return;
    const nextQuery = value?.locationName ?? "";
    searchAbortRef.current?.abort();
    setQuery((currentQuery) => {
      if (currentQuery.text === nextQuery && !currentQuery.shouldSearch) return currentQuery;
      return { text: nextQuery, shouldSearch: false };
    });
  }, [value?.locationName]);

  useEffect(() => {
    setCanRenderMap(true);
  }, []);

  useEffect(() => {
    // Clearing the form value during a country lookup must keep the selected pin.
    if (!value && reverseAbortRef.current) return;
    setPin((current) => {
      if (!value) return current ? null : current;
      if (current?.lat === value.lat && current.lng === value.lng) return current;
      return { lat: value.lat, lng: value.lng };
    });
  }, [value]);

  const setSearchQueryFromLocation = useCallback((nextQuery: string) => {
    searchAbortRef.current?.abort();
    setQuery({ text: nextQuery, shouldSearch: false });
  }, []);

  const placePin = useCallback(
    (lat: number, lng: number, options: PlacePinOptions = {}) => {
      searchAbortRef.current?.abort();
      setQuery((current) => (current.shouldSearch ? { ...current, shouldSearch: false } : current));
      setPin({ lat, lng });
      if (options.clearSuggestions !== false) {
        setSuggestions([]);
      }
      setReverseError(null);
      setReversePending(true);
      reverseAbortRef.current?.abort();
      const controller = new AbortController();
      reverseAbortRef.current = controller;
      const requestId = reverseRequestRef.current + 1;
      reverseRequestRef.current = requestId;
      onChangeRef.current(undefined);

      void reverseLocation(lat, lng, controller.signal).then((result) => {
        if (controller.signal.aborted || reverseRequestRef.current !== requestId) {
          return;
        }
        reverseAbortRef.current = null;
        setReversePending(false);
        const reverseErrorMsg = t`Couldn't identify a country here. Try a nearby spot.`;
        if (!result) {
          setReverseError(reverseErrorMsg);
          onChangeRef.current(undefined);
          return;
        }

        const parsed = locationSchema.safeParse({
          lat,
          lng,
          locationName: options.locationNameHint ?? result.locationName,
          country: result.country,
        });
        if (!parsed.success) {
          setReverseError(reverseErrorMsg);
          onChangeRef.current(undefined);
          return;
        }

        setReverseError(null);
        if (options.updateSearchInput !== false) {
          setSearchQueryFromLocation(parsed.data.locationName);
        }
        onChangeRef.current(parsed.data);
      });
    },
    [setSearchQueryFromLocation, t],
  );

  useEffect(() => {
    searchAbortRef.current?.abort();
    // Only text entered by the user searches. Saved and reverse-geocoded names
    // remain selected across rerenders and effect replay.
    if (!query.shouldSearch) {
      setSuggestions([]);
      setSearching(false);
      return;
    }

    const trimmedQuery = query.text.trim();
    if (trimmedQuery.length < 3) {
      setSuggestions([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const controller = new AbortController();
    searchAbortRef.current = controller;
    const timeout = setTimeout(() => {
      void searchLocations(trimmedQuery, controller.signal).then((results) => {
        if (controller.signal.aborted) return;
        setSuggestions(results.slice(0, 4));
        setSearching(false);
      });
    }, 400);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [query.text, query.shouldSearch]);

  useEffect(() => {
    return () => {
      searchAbortRef.current?.abort();
      reverseAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (geoStatus === "granted" && geoLat !== null && geoLng !== null) {
      placePin(geoLat, geoLng);
    }
  }, [geoStatus, geoLat, geoLng, placePin]);

  const geoUnavailable =
    geolocation.state.status === "denied" || geolocation.state.status === "unavailable";
  const geoRequesting = geolocation.state.status === "requesting";
  const shownError = reverseError ?? (reversePending ? undefined : error);

  return (
    <div className="space-y-3">
      <div className="relative">
        <label htmlFor="location-search" className="flex items-baseline gap-2 font-medium text-sm">
          <span>{label ?? <Trans>Location</Trans>}</span>
          {required ? (
            <span aria-hidden="true" className="font-normal text-destructive text-xs">
              <Trans>Required</Trans>
            </span>
          ) : null}
        </label>
        <div className="relative mt-1.5">
          <Input
            id="location-search"
            type="text"
            role="searchbox"
            autoComplete="off"
            placeholder={t`Search for a town or place`}
            value={query.text}
            onChange={(event) => {
              setQuery({ text: event.target.value, shouldSearch: true });
            }}
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
                onClick={() => {
                  setSearchQueryFromLocation(suggestion.address);
                  placePin(suggestion.lat, suggestion.lng, {
                    locationNameHint: suggestion.address,
                  });
                }}
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
            <output className="block h-52 w-full border border-border bg-card">
              <span className="sr-only">
                <Trans>Loading location map</Trans>
              </span>
            </output>
          }
        >
          <LocationMap
            lat={pin?.lat ?? null}
            lng={pin?.lng ?? null}
            interactive
            onLocationChange={placePin}
            markerStyle={markerStyle}
          />
        </Suspense>
      ) : (
        <output className="block h-52 w-full border border-border bg-card">
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
