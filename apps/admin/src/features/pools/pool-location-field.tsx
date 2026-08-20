import { Suspense, useEffect, useRef, useState } from "react";

import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { LocationMap } from "#/components/ui/location-map.lazy";
import { Skeleton } from "#/components/ui/skeleton";
import { reverseLocation } from "#/lib/geo-client";

/**
 * Directory place for a pool: the pin is the coordinate input, the name is
 * the label stored next to it.
 *
 * A click reverse-geocodes the point so the two stay a pair. The name stays
 * editable afterwards — a pool's directory label is often a market or ward,
 * not the ArcGIS street string — but a later pin still replaces it so the
 * label cannot describe the previous place.
 */
export function PoolLocationField({
  name,
  latitude,
  longitude,
  nameError,
  coordinateError,
  onNameChange,
  onNameBlur,
  onCoordinatesChange,
}: {
  name: string;
  latitude: string;
  longitude: string;
  nameError: string | null;
  coordinateError: string | null;
  onNameChange: (value: string) => void;
  onNameBlur: () => void;
  onCoordinatesChange: (latitude: string, longitude: string) => void;
}) {
  const [resolving, setResolving] = useState(false);
  const [unnamed, setUnnamed] = useState(false);
  const lookupRef = useRef<AbortController | null>(null);

  useEffect(() => () => lookupRef.current?.abort(), []);

  const lat = parseCoordinate(latitude);
  const lng = parseCoordinate(longitude);
  const hasPin = lat !== null && lng !== null;

  async function handlePin(nextLat: number, nextLng: number) {
    lookupRef.current?.abort();
    const lookup = new AbortController();
    lookupRef.current = lookup;

    onCoordinatesChange(String(nextLat), String(nextLng));
    setUnnamed(false);
    setResolving(true);

    const resolved = await reverseLocation(nextLat, nextLng, lookup.signal);
    if (lookup.signal.aborted) return;

    setResolving(false);
    if (resolved) onNameChange(resolved);
    else setUnnamed(true);
  }

  function clearPin() {
    lookupRef.current?.abort();
    setResolving(false);
    setUnnamed(false);
    onCoordinatesChange("", "");
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="locationName">Location</Label>
        <Input
          id="locationName"
          value={name}
          onBlur={onNameBlur}
          onChange={(event) => onNameChange(event.target.value)}
          aria-invalid={nameError !== null}
          placeholder="Click the map to set a location"
        />
        {nameError ? (
          <p role="alert" className="text-destructive text-xs">
            {nameError}
          </p>
        ) : null}
      </div>

      <Suspense fallback={<Skeleton className="h-40 w-full" />}>
        <LocationMap
          lat={lat}
          lng={lng}
          interactive
          className="h-40"
          onLocationChange={(nextLat, nextLng) => void handlePin(nextLat, nextLng)}
        />
      </Suspense>

      {resolving ? (
        <p className="text-muted-foreground text-xs">Finding this place…</p>
      ) : unnamed ? (
        <p className="text-destructive text-xs">No place found here. Try a nearby point.</p>
      ) : hasPin ? (
        <div className="flex items-center justify-between gap-2">
          <p className="font-data text-muted-foreground text-xs">
            {lat.toFixed(5)}, {lng.toFixed(5)}
          </p>
          <Button type="button" variant="ghost" size="xs" onClick={clearPin}>
            Clear pin
          </Button>
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">Click the map to drop a pin.</p>
      )}
      {coordinateError ? (
        <p role="alert" className="text-destructive text-xs">
          {coordinateError}
        </p>
      ) : null}
    </div>
  );
}

function parseCoordinate(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}
