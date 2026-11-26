import "maplibre-gl/dist/maplibre-gl.css";
import type { RegionBoundary } from "@clc/core/features/regions/logic";
import MapLibreGL, { type GeoJSONSource, type LngLatBoundsLike } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { BRAND_THEME_COLOR } from "#/lib/brand";
import { ADMIN_MAP_STYLE_URL } from "#/lib/map-style";

const SOURCE = "region-boundaries";
const FILL = "region-fills";
const OUTLINE = "region-outlines";

type Area = { id: string; boundary: RegionBoundary };
type CoverageProps = {
  areas: readonly Area[];
  highlighted: readonly string[];
  onSelect?: (id: string) => void;
};

function regionBounds(areas: readonly Area[]): LngLatBoundsLike | null {
  const longitudes: number[] = [];
  let south = 90;
  let north = -90;
  for (const { boundary } of areas) {
    const polygons = boundary.type === "Polygon" ? [boundary.coordinates] : boundary.coordinates;
    for (const polygon of polygons) {
      for (const ring of polygon) {
        for (const [lng, lat] of ring) {
          longitudes.push(lng!);
          south = Math.min(south, lat!);
          north = Math.max(north, lat!);
        }
      }
    }
  }
  if (!longitudes.length) return null;
  longitudes.sort((a, b) => a - b);
  // The complement of the largest gap fits an area spanning the date line
  // without framing almost the entire world around it.
  let west = longitudes[0]!;
  let east = longitudes.at(-1)!;
  let largestGap = west + 360 - east;
  for (let i = 0; i + 1 < longitudes.length; i++) {
    const gap = longitudes[i + 1]! - longitudes[i]!;
    if (gap <= largestGap) continue;
    largestGap = gap;
    west = longitudes[i + 1]!;
    east = longitudes[i]! + 360;
  }
  const clampLatitude = (latitude: number) => Math.max(-85, Math.min(latitude, 85));
  return [
    [west, clampLatitude(south)],
    [east, clampLatitude(north)],
  ];
}

export function RegionCoverageMap({ areas, highlighted, onSelect }: CoverageProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreGL.Map | null>(null);
  const select = useRef(onSelect);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    select.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!container.current) return;
    let instance: MapLibreGL.Map;
    try {
      instance = new MapLibreGL.Map({
        container: container.current,
        style: ADMIN_MAP_STYLE_URL,
        center: [15, 20],
        zoom: 1,
        maxPitch: 0,
        dragRotate: false,
        attributionControl: false,
      });
    } catch {
      setFailed(true);
      return;
    }
    map.current = instance;
    instance.addControl(new MapLibreGL.NavigationControl({ showCompass: false }), "bottom-right");
    instance.addControl(new MapLibreGL.AttributionControl({ compact: true }), "bottom-left");

    let loaded = false;
    instance.on("error", () => {
      if (!loaded) setFailed(true);
    });
    instance.on("style.load", () => {
      instance.addSource(SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      instance.addLayer({
        id: FILL,
        type: "fill",
        source: SOURCE,
        paint: {
          "fill-color": ["case", ["get", "highlighted"], BRAND_THEME_COLOR.light, "#334155"],
          "fill-opacity": ["case", ["get", "highlighted"], 0.34, 0.17],
        },
      });
      instance.addLayer({
        id: OUTLINE,
        type: "line",
        source: SOURCE,
        paint: {
          "line-color": ["case", ["get", "highlighted"], BRAND_THEME_COLOR.light, "#334155"],
          "line-width": ["case", ["get", "highlighted"], 2.5, 1.5],
        },
      });
      loaded = true;
      setFailed(false);
      setReady(true);
    });
    instance.on("click", FILL, (event) => {
      const id = event.features?.[0]?.properties.id;
      if (typeof id === "string") select.current?.(id);
    });
    return () => {
      instance.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready || !map.current) return;
    const selected = new Set(highlighted);
    map.current.getSource<GeoJSONSource>(SOURCE)?.setData({
      type: "FeatureCollection",
      features: areas.map(({ id, boundary }) => ({
        type: "Feature",
        properties: { id, highlighted: selected.has(id) },
        geometry: boundary,
      })),
    });
    const focus = selected.size ? areas.filter(({ id }) => selected.has(id)) : areas;
    const bounds = regionBounds(focus.length ? focus : areas);
    if (bounds) map.current.fitBounds(bounds, { padding: 28, maxZoom: 12, duration: 0 });
  }, [areas, highlighted, ready]);

  return (
    <div
      aria-label="Region boundaries map"
      role="region"
      className="relative border border-border bg-card"
    >
      <div ref={container} className="h-64" />
      {failed ? (
        <p
          role="status"
          className="pointer-events-none absolute inset-0 grid place-items-center bg-card p-4 text-sm text-muted-foreground"
        >
          Map unavailable. Use the boundary information to review coverage.
        </p>
      ) : null}
    </div>
  );
}
