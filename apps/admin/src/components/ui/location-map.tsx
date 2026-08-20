import "maplibre-gl/dist/maplibre-gl.css";
import MapLibreGL, { type MapMouseEvent } from "maplibre-gl";
import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "#/lib/utils";

/**
 * A MapLibre map with one optional pin, ported from apps/web's component of the
 * same name.
 *
 * Copied rather than shared: the apps cannot import each other, and a vendor SDK
 * belongs to an app rather than to `packages/core` or `packages/api`. The
 * differences from the web original are only the two that must differ — no lingui
 * (this console is English-only) and no rounded corners (Lyra surfaces are
 * square). Behaviour, refs and lifecycle are deliberately unchanged, so a fix in
 * either copy reads the same in the other.
 *
 * **Import through `location-map.lazy.tsx`.** MapLibre is far larger than
 * anything else in this console, and loading it eagerly would put it in the shell
 * chunk that `check:bundle` guards, on every screen including the ones with no
 * map.
 *
 * Renders nothing at all when `VITE_MAPTILER_KEY` is absent or WebGL is
 * unavailable: a map that cannot draw tiles is worse than a page without one, and
 * every screen using this keeps its own copy of the location as text.
 */

const NAIROBI = { lat: -1.2921, lng: 36.8219 };
const PIN_ZOOM = 13;
const EMPTY_ZOOM = 5;
const MARKER_COLOR = "#166534";

type LocationMapProps = {
  lat?: number | null;
  lng?: number | null;
  interactive?: boolean;
  onLocationChange?: (lat: number, lng: number) => void;
  className?: string;
};

function hasWebGlSupport(): boolean {
  const canvas = document.createElement("canvas");
  return !!(canvas.getContext("webgl") ?? canvas.getContext("experimental-webgl"));
}

export function LocationMap({
  lat,
  lng,
  interactive = false,
  onLocationChange,
  className,
}: LocationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreGL.Map | null>(null);
  const markerRef = useRef<MapLibreGL.Marker | null>(null);
  const onLocationChangeRef = useRef(onLocationChange);
  const initialLocationRef = useRef({ lat, lng });
  const interactiveRef = useRef(interactive);
  const pendingRef = useRef<{ lat: number; lng: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const maptilerKey = import.meta.env.VITE_MAPTILER_KEY as string | undefined;
  const maptilerStyle = maptilerKey
    ? `https://api.maptiler.com/maps/base-v4/style.json?key=${encodeURIComponent(maptilerKey)}`
    : null;

  useEffect(() => {
    onLocationChangeRef.current = onLocationChange;
  }, [onLocationChange]);

  useEffect(() => {
    interactiveRef.current = interactive;
  }, [interactive]);

  const setMarker = useCallback((map: MapLibreGL.Map, nextLat: number, nextLng: number) => {
    if (markerRef.current) {
      markerRef.current.setLngLat([nextLng, nextLat]);
      return;
    }

    markerRef.current = new MapLibreGL.Marker({
      color: MARKER_COLOR,
      draggable: interactiveRef.current,
    })
      .setLngLat([nextLng, nextLat])
      .addTo(map);
    markerRef.current.on("dragend", () => {
      const markerLngLat = markerRef.current?.getLngLat();
      if (!markerLngLat) return;
      onLocationChangeRef.current?.(markerLngLat.lat, markerLngLat.lng);
    });
  }, []);

  useEffect(() => {
    if (!maptilerStyle || failed || !containerRef.current || mapRef.current) {
      return;
    }
    if (!hasWebGlSupport()) {
      setFailed(true);
      return;
    }

    const initialLocation = initialLocationRef.current;
    const isInteractive = interactiveRef.current;
    const hasLocation =
      typeof initialLocation.lat === "number" && typeof initialLocation.lng === "number";
    const center: [number, number] = hasLocation
      ? [initialLocation.lng as number, initialLocation.lat as number]
      : [NAIROBI.lng, NAIROBI.lat];
    let map: MapLibreGL.Map;
    try {
      map = new MapLibreGL.Map({
        container: containerRef.current,
        style: maptilerStyle,
        center,
        zoom: hasLocation ? PIN_ZOOM : EMPTY_ZOOM,
        interactive: isInteractive,
        attributionControl: false,
      });
    } catch {
      setFailed(true);
      return;
    }

    mapRef.current = map;
    map.addControl(new MapLibreGL.NavigationControl(), "bottom-right");

    function removeMap() {
      markerRef.current?.remove();
      markerRef.current = null;
      if (mapRef.current === map) {
        map.remove();
        mapRef.current = null;
      }
    }

    function handleMapClick(event: MapMouseEvent) {
      if (!isInteractive) return;
      const { lat: clickLat, lng: clickLng } = event.lngLat;
      setMarker(map, clickLat, clickLng);
      onLocationChangeRef.current?.(clickLat, clickLng);
    }

    function flyToPin(nextLat: number, nextLng: number) {
      map.flyTo({ center: [nextLng, nextLat], zoom: PIN_ZOOM });
    }

    function handleLoad() {
      const pending = pendingRef.current;
      if (pending) {
        setMarker(map, pending.lat, pending.lng);
        flyToPin(pending.lat, pending.lng);
        pendingRef.current = null;
        return;
      }
      if (hasLocation) {
        setMarker(map, initialLocation.lat as number, initialLocation.lng as number);
        flyToPin(initialLocation.lat as number, initialLocation.lng as number);
      }
    }

    if (isInteractive) {
      map.getCanvas().style.cursor = "crosshair";
      map.on("click", handleMapClick);
    }
    map.on("load", handleLoad);

    return () => {
      if (isInteractive) map.off("click", handleMapClick);
      map.off("load", handleLoad);
      removeMap();
    };
  }, [failed, maptilerStyle, setMarker]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (typeof lat === "number" && typeof lng === "number") {
      if (!map.loaded()) {
        pendingRef.current = { lat, lng };
        return;
      }
      setMarker(map, lat, lng);
      map.flyTo({ center: [lng, lat], zoom: PIN_ZOOM });
      pendingRef.current = null;
      return;
    }

    pendingRef.current = null;
    markerRef.current?.remove();
    markerRef.current = null;
  }, [lat, lng, setMarker]);

  if (!maptilerStyle || failed) return null;

  return (
    <section
      ref={containerRef}
      aria-label="Location map"
      className={cn("border-border bg-card h-48 w-full overflow-hidden border", className)}
    />
  );
}
