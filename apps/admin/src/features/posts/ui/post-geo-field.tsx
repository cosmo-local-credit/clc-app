import { Suspense, useState } from "react";

import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { LocationMap } from "#/components/ui/location-map.lazy";
import { Skeleton } from "#/components/ui/skeleton";

/**
 * A post's coordinates.
 *
 * Not `LocationField`: that control edits a coordinate pair *and* the place name
 * beside it, and `reports.location_name` was dropped in migration 010. Only
 * `geoLat` and `geoLng` persist, so a name input here would be a field the save
 * discards.
 *
 * Both halves move together — clc-core rejects a half coordinate — so Clear
 * empties both and a typed pair is only reported when both parse.
 */
export function PostGeoField({
  latitude,
  longitude,
  error,
  disabled,
  onChange,
}: {
  latitude: number | null;
  longitude: number | null;
  error?: string | null;
  disabled?: boolean;
  onChange: (value: { lat: number; lng: number } | null) => void;
}) {
  // Drafts are text so a partly typed "-1." is not thrown away between
  // keystrokes; the pair is only reported once both parse.
  const [latDraft, setLatDraft] = useState(latitude === null ? "" : String(latitude));
  const [lngDraft, setLngDraft] = useState(longitude === null ? "" : String(longitude));

  function commit(nextLat: string, nextLng: string) {
    setLatDraft(nextLat);
    setLngDraft(nextLng);

    if (nextLat.trim() === "" && nextLng.trim() === "") {
      onChange(null);
      return;
    }
    const lat = Number(nextLat);
    const lng = Number(nextLng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    onChange({ lat, lng });
  }

  const hasPin = latitude !== null && longitude !== null;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="post-geo-lat">Latitude</Label>
          <Input
            id="post-geo-lat"
            inputMode="decimal"
            className="font-mono"
            value={latDraft}
            disabled={disabled}
            onChange={(event) => commit(event.target.value, lngDraft)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="post-geo-lng">Longitude</Label>
          <Input
            id="post-geo-lng"
            inputMode="decimal"
            className="font-mono"
            value={lngDraft}
            disabled={disabled}
            onChange={(event) => commit(latDraft, event.target.value)}
          />
        </div>
      </div>

      {/* Interactive so a click on the map is a coordinate input, which is how
          the pool and voucher forms set a place too. */}
      <Suspense fallback={<Skeleton className="h-48 w-full" />}>
        <LocationMap
          lat={latitude}
          lng={longitude}
          interactive={!disabled}
          className="h-48"
          onLocationChange={(nextLat, nextLng) => commit(String(nextLat), String(nextLng))}
        />
      </Suspense>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || (!hasPin && latDraft === "" && lngDraft === "")}
          onClick={() => commit("", "")}
        >
          Clear place
        </Button>
        <span className="text-muted-foreground text-xs">
          Both values are saved together, or neither.
        </span>
      </div>

      {error ? (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}
