import type { LocationInput } from "@clc/core/features/location/logic";
import { locationSchema } from "@clc/core/features/location/logic";
import { useLingui } from "@lingui/react/macro";
import { useCallback, useEffect, useRef, useState } from "react";

import type { GeocodeSuggestion } from "#/lib/geo-client";
import { reverseLocation, searchLocations } from "#/lib/geo-client";
import { useBrowserGeolocation } from "#/lib/use-browser-geolocation";

type PlacePinOptions = {
  locationNameHint?: string;
  clearSuggestions?: boolean;
  updateSearchInput?: boolean;
};

/**
 * A location field's state: the place search with its suggestions, the pin,
 * the reverse lookup that turns a pin into a named place with a country, and
 * "use my location". The phone picker and the desktop field draw it.
 */
export function useLocationPicker({
  value,
  onChange,
  error,
}: {
  /** The country is only ever produced by the picker, so a stored place may omit it. */
  value: (Omit<LocationInput, "country"> & { country?: string }) | undefined;
  onChange: (value: LocationInput | undefined) => void;
  error?: string;
}) {
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

  return {
    query: query.text,
    search: (text: string) => setQuery({ text, shouldSearch: true }),
    suggestions,
    chooseSuggestion: (suggestion: GeocodeSuggestion) => {
      setSearchQueryFromLocation(suggestion.address);
      placePin(suggestion.lat, suggestion.lng, { locationNameHint: suggestion.address });
    },
    searching,
    pin,
    placePin,
    reversePending,
    shownError,
    canRenderMap,
    geolocation,
    geoUnavailable,
    geoRequesting,
  };
}
