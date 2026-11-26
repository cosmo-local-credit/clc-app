import "maplibre-gl/dist/maplibre-gl.css";
import type { Region, RegionBoundary } from "@clc/core/features/regions/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import MapLibreGL, { type GeoJSONSource } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";

import { BRAND_THEME_COLOR } from "#/lib/brand";
import { standardMapStyleUrl } from "#/lib/map-appearance";
import { useHydratedTheme } from "#/providers/theme";

import { regionBounds } from "./region-map-bounds";

const SOURCE = "assigned-region";
const COLOR = BRAND_THEME_COLOR.light;

function feature(boundary: RegionBoundary) {
  return { type: "Feature" as const, geometry: boundary, properties: {} };
}

function fitBoundary(map: MapLibreGL.Map, boundary: RegionBoundary) {
  map.fitBounds(regionBounds(boundary), { padding: 24, maxZoom: 13, duration: 0 });
}

export function RegionMap({ region }: { region: Region }) {
  const { t } = useLingui();
  const { theme } = useHydratedTheme();
  const style = standardMapStyleUrl(theme);
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreGL.Map | null>(null);
  const latest = useRef({ boundary: region.boundary, style });
  latest.current = { boundary: region.boundary, style };
  const appliedStyle = useRef<string | undefined>(undefined);
  const framed = useRef<RegionBoundary | undefined>(undefined);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (failed || !container.current) return;
    let map: MapLibreGL.Map;
    try {
      map = new MapLibreGL.Map({
        container: container.current,
        style: latest.current.style,
        cooperativeGestures: true,
        dragRotate: false,
        maxPitch: 0,
        attributionControl: false,
      });
    } catch {
      setFailed(true);
      return;
    }
    mapRef.current = map;
    appliedStyle.current = latest.current.style;
    map.addControl(new MapLibreGL.AttributionControl({ compact: true }), "bottom-left");

    function restoreBoundary() {
      const { boundary } = latest.current;
      if (!map.getSource(SOURCE)) {
        map.addSource(SOURCE, { type: "geojson", data: feature(boundary) });
        map.addLayer({
          id: "assigned-region-fill",
          type: "fill",
          source: SOURCE,
          paint: { "fill-color": COLOR, "fill-opacity": 0.16 },
        });
        map.addLayer({
          id: "assigned-region-outline",
          type: "line",
          source: SOURCE,
          paint: { "line-color": COLOR, "line-width": 3 },
        });
      }
      if (framed.current !== boundary) {
        fitBoundary(map, boundary);
        framed.current = boundary;
      }
    }

    function handleError() {
      // Optional basemap tile failures do not hide a boundary already drawn.
      if (!map.getSource(SOURCE)) setFailed(true);
    }

    map.on("style.load", restoreBoundary);
    map.on("error", handleError);
    return () => {
      map.off("style.load", restoreBoundary);
      map.off("error", handleError);
      map.remove();
      mapRef.current = null;
      framed.current = undefined;
    };
  }, [failed]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || appliedStyle.current === style) return;
    try {
      appliedStyle.current = style;
      map.setStyle(style);
    } catch {
      setFailed(true);
    }
  }, [style]);

  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource<GeoJSONSource>(SOURCE);
    if (!map || !source || framed.current === region.boundary) return;
    source.setData(feature(region.boundary));
    fitBoundary(map, region.boundary);
    framed.current = region.boundary;
  }, [region.boundary]);

  if (failed) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        <Trans>The map could not be loaded.</Trans>
      </p>
    );
  }
  return (
    <div
      ref={container}
      role="region"
      aria-label={t`Map of ${region.name}`}
      className="h-72 w-full border border-border bg-card"
    />
  );
}
