import type MapLibreGL from "maplibre-gl";
import type { GeoJSONSource } from "maplibre-gl";

const SOURCE_ID = "market-label-edges";
const IMAGE_ID = "market-label-edge";
// Cover MapLibre's 100 px collision margin outside the viewport, plus room
// for long names. A small inset keeps the text halo inside the map too.
const EDGE_DEPTH = 200;
const EDGE_INSET = 2;

type Obstacle = { x: number; y: number; anchor: "left" | "right" | "top" | "bottom" };

/**
 * Variable text anchors test collisions, not viewport bounds. Transparent
 * symbols around the screen turn its edges into collision obstacles, so a
 * clipped name tries its other anchor or gives way. Pins still allow overlap.
 *
 * The obstacles only hold while the map is at rest. Each `setData` re-tiles the
 * source and re-places every symbol, so following the camera frame by frame
 * turns a pan into a slideshow. Geographic symbols cannot stay put on screen
 * either: left in place they would slide inward and hide names in a band. So
 * they lift when a move starts, names clip at the edge in motion as they do on
 * any native map, and they return where the camera settles.
 *
 * The bottom edge is the top of whatever sheet covers the map, so a name is
 * never placed where the sheet hides it.
 */
export function keepMarketLabelsInsideViewport(
  map: MapLibreGL.Map,
  /** Pixels a sheet covers at the bottom of the map, read each time the edges settle. */
  bottomInset: () => number = () => 0,
): () => void {
  // One transparent pixel scaled to EDGE_DEPTH: the collision box grows with
  // `icon-size`, while every rebuild packs a single pixel into the icon atlas
  // instead of a viewport-sized bitmap.
  if (!map.hasImage(IMAGE_ID)) {
    map.addImage(IMAGE_ID, { width: 1, height: 1, data: new Uint8Array(4) });
  }

  function obstacles(): Obstacle[] {
    const { clientWidth, clientHeight } = map.getCanvas();
    const width = Math.max(1, clientWidth);
    const height = Math.max(1, clientHeight);
    const bottom = Math.max(1, height - bottomInset());
    const result: Obstacle[] = [];
    // The side columns run past both corners; the rows only span the width.
    for (let top = -EDGE_DEPTH; top < height + EDGE_DEPTH; top += EDGE_DEPTH) {
      const y = top + EDGE_DEPTH / 2;
      result.push({ x: EDGE_INSET, y, anchor: "right" });
      result.push({ x: width - EDGE_INSET, y, anchor: "left" });
    }
    for (let left = 0; left < width; left += EDGE_DEPTH) {
      const x = left + EDGE_DEPTH / 2;
      result.push({ x, y: EDGE_INSET, anchor: "bottom" });
      result.push({ x, y: bottom - EDGE_INSET, anchor: "top" });
    }
    return result;
  }

  function collection() {
    return {
      type: "FeatureCollection" as const,
      features: obstacles().map(({ x, y, anchor }) => {
        const point = map.unproject([x, y]);
        return {
          type: "Feature" as const,
          properties: { anchor },
          geometry: { type: "Point" as const, coordinates: [point.lng, point.lat] },
        };
      }),
    };
  }

  map.addSource(SOURCE_ID, { type: "geojson", data: collection() });
  // Added last: these obstacles and all pins are placed before either name layer.
  map.addLayer({
    id: SOURCE_ID,
    type: "symbol",
    source: SOURCE_ID,
    layout: {
      "icon-image": IMAGE_ID,
      "icon-size": EDGE_DEPTH,
      "icon-anchor": ["get", "anchor"],
      "icon-padding": 0,
      "icon-allow-overlap": true,
    },
  });

  function lift() {
    const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData({ type: "FeatureCollection", features: [] });
  }

  // `resize` needs no listener: a resize at rest fires its own `moveend`, and
  // one during a gesture is picked up by the gesture's. So does a change of
  // inset, which moves the camera's padding.
  function settle() {
    const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData(collection());
  }

  map.on("movestart", lift);
  map.on("moveend", settle);
  return () => {
    map.off("movestart", lift);
    map.off("moveend", settle);
  };
}
