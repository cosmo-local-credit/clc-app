import "maplibre-gl/dist/maplibre-gl.css";
import type { MapMarkerStyle } from "@clc/core/features/markers/logic";
import { useLingui } from "@lingui/react/macro";
import MapLibreGL, { type MapMouseEvent } from "maplibre-gl";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  FixedResourceMarkerPin,
  type FixedResourceMarkerKind,
  MarkerPin,
} from "#/components/vouchers/marker-style-picker";
import { BRAND_THEME_COLOR } from "#/lib/brand";
import { standardMapStyleUrl } from "#/lib/map-appearance";
import { cn } from "#/lib/utils";
import { useHydratedTheme } from "#/providers/theme";

const WORLD = { lat: 0, lng: 20 };
const PIN_ZOOM = 13;
const WORLD_ZOOM = 2;
const MARKER_COLOR = BRAND_THEME_COLOR.light;

type LocationMapProps = {
  lat?: number | null;
  lng?: number | null;
  interactive?: boolean;
  onLocationChange?: (lat: number, lng: number) => void;
  cameraHint?: { lat: number; lng: number; zoom: number } | null;
  markerStyle?: MapMarkerStyle;
  markerResource?: FixedResourceMarkerKind;
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
  cameraHint,
  markerStyle,
  markerResource,
  className,
}: LocationMapProps) {
  const { t } = useLingui();
  const { theme } = useHydratedTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreGL.Map | null>(null);
  const hasLoadedRef = useRef(false);
  const markerRef = useRef<MapLibreGL.Marker | null>(null);
  const userInteractedRef = useRef(false);
  const onLocationChangeRef = useRef(onLocationChange);
  const initialLocationRef = useRef({ lat, lng });
  const cameraHintRef = useRef(cameraHint);
  cameraHintRef.current = cameraHint;
  const appliedCameraHintRef = useRef(cameraHint ?? null);
  const interactiveRef = useRef(interactive);
  const markerStyleRef = useRef(markerStyle);
  const markerResourceRef = useRef(markerResource);
  const [markerElement, setMarkerElement] = useState<HTMLDivElement | null>(null);
  const pendingRef = useRef<{ lat: number; lng: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const mapStyle = standardMapStyleUrl(theme);
  const mapStyleRef = useRef(mapStyle);
  mapStyleRef.current = mapStyle;
  const appliedStyleRef = useRef<string | null>(null);

  useEffect(() => {
    onLocationChangeRef.current = onLocationChange;
  }, [onLocationChange]);

  useEffect(() => {
    interactiveRef.current = interactive;
  }, [interactive]);

  useEffect(() => {
    markerStyleRef.current = markerStyle;
  }, [markerStyle]);

  useEffect(() => {
    markerResourceRef.current = markerResource;
  }, [markerResource]);

  const setMarker = useCallback((map: MapLibreGL.Map, nextLat: number, nextLng: number) => {
    if (markerRef.current) {
      markerRef.current.setLngLat([nextLng, nextLat]);
      return;
    }

    const element =
      markerStyleRef.current || markerResourceRef.current ? document.createElement("div") : null;
    if (element) setMarkerElement(element);
    markerRef.current = new MapLibreGL.Marker({
      ...(element
        ? { element, anchor: "bottom" as const, offset: [0, 4] as [number, number] }
        : { color: MARKER_COLOR }),
      draggable: interactiveRef.current,
    })
      .setLngLat([nextLng, nextLat])
      .addTo(map);
    markerRef.current.on("dragend", () => {
      userInteractedRef.current = true;
      const markerLngLat = markerRef.current?.getLngLat();
      if (!markerLngLat) return;
      onLocationChangeRef.current?.(markerLngLat.lat, markerLngLat.lng);
    });
  }, []);

  useEffect(() => {
    if (failed || !containerRef.current || mapRef.current) {
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
    const initialCameraHint = cameraHintRef.current;
    const center: [number, number] = hasLocation
      ? [initialLocation.lng as number, initialLocation.lat as number]
      : initialCameraHint
        ? [initialCameraHint.lng, initialCameraHint.lat]
        : [WORLD.lng, WORLD.lat];
    let map: MapLibreGL.Map;
    try {
      const initialStyle = mapStyleRef.current;
      map = new MapLibreGL.Map({
        container: containerRef.current,
        style: initialStyle,
        center,
        zoom: hasLocation ? PIN_ZOOM : (initialCameraHint?.zoom ?? WORLD_ZOOM),
        interactive: isInteractive,
        attributionControl: false,
      });
      appliedStyleRef.current = initialStyle;
    } catch {
      setFailed(true);
      return;
    }

    mapRef.current = map;
    map.addControl(new MapLibreGL.NavigationControl(), "bottom-right");
    map.addControl(new MapLibreGL.AttributionControl({ compact: true }), "bottom-left");

    function removeMap() {
      hasLoadedRef.current = false;
      markerRef.current?.remove();
      markerRef.current = null;
      if (mapRef.current === map) {
        map.remove();
        mapRef.current = null;
        appliedStyleRef.current = null;
      }
    }

    function handleMapClick(event: MapMouseEvent) {
      if (!isInteractive) return;
      userInteractedRef.current = true;
      const { lat: clickLat, lng: clickLng } = event.lngLat;
      setMarker(map, clickLat, clickLng);
      onLocationChangeRef.current?.(clickLat, clickLng);
    }

    function handleUserDragStart() {
      userInteractedRef.current = true;
    }

    function flyToPin(nextLat: number, nextLng: number) {
      map.flyTo({ center: [nextLng, nextLat], zoom: PIN_ZOOM });
    }

    function handleLoad() {
      hasLoadedRef.current = true;
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
        return;
      }
      const latestCameraHint = cameraHintRef.current;
      if (latestCameraHint && latestCameraHint !== initialCameraHint) {
        appliedCameraHintRef.current = latestCameraHint;
        map.flyTo({
          center: [latestCameraHint.lng, latestCameraHint.lat],
          zoom: latestCameraHint.zoom,
        });
      }
    }

    if (isInteractive) {
      map.getCanvas().style.cursor = "crosshair";
      map.on("click", handleMapClick);
      map.on("dragstart", handleUserDragStart);
    }
    map.on("load", handleLoad);

    return () => {
      if (isInteractive) {
        map.off("click", handleMapClick);
        map.off("dragstart", handleUserDragStart);
      }
      map.off("load", handleLoad);
      removeMap();
    };
  }, [failed, setMarker]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || appliedStyleRef.current === mapStyle) return;
    try {
      appliedStyleRef.current = mapStyle;
      map.setStyle(mapStyle);
    } catch {
      setFailed(true);
    }
  }, [mapStyle]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (typeof lat === "number" && typeof lng === "number") {
      // loaded() becomes false again while tiles load after a camera move.
      // Only wait for the initial load event before updating the pin.
      if (!hasLoadedRef.current) {
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
    setMarkerElement(null);
  }, [lat, lng, setMarker]);

  useEffect(() => {
    const map = mapRef.current;
    if (
      !map ||
      !hasLoadedRef.current ||
      !cameraHint ||
      userInteractedRef.current ||
      (typeof lat === "number" && typeof lng === "number")
    )
      return;
    const applied = appliedCameraHintRef.current;
    if (
      applied?.lat === cameraHint.lat &&
      applied.lng === cameraHint.lng &&
      applied.zoom === cameraHint.zoom
    )
      return;
    appliedCameraHintRef.current = cameraHint;
    map.flyTo({ center: [cameraHint.lng, cameraHint.lat], zoom: cameraHint.zoom });
  }, [cameraHint, lat, lng]);

  if (failed) return null;

  return (
    <>
      <section
        ref={containerRef}
        aria-label={t`Location map`}
        // Panning an interactive map inside a bottom sheet must not drag it closed.
        data-base-ui-swipe-ignore={interactive ? "" : undefined}
        className={cn("h-52 w-full overflow-hidden border border-border bg-card", className)}
      />
      {markerElement
        ? createPortal(
            markerResource ? (
              <FixedResourceMarkerPin resource={markerResource} size={40} />
            ) : markerStyle ? (
              <MarkerPin style={markerStyle} size={40} className="block" />
            ) : null,
            markerElement,
          )
        : null}
    </>
  );
}
