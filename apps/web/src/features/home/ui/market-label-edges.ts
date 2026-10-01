import type MapLibreGL from "maplibre-gl";
import type { GeoJSONSource } from "maplibre-gl";

const SOURCE_ID = "market-label-edges";
const VERTICAL_IMAGE_ID = "market-label-edge-vertical";
const HORIZONTAL_IMAGE_ID = "market-label-edge-horizontal";
// Cover MapLibre's 100 px collision margin outside the viewport, plus room
// for long names. A small inset keeps the text halo inside the map too.
const EDGE_DEPTH = 200;
const EDGE_INSET = 2;

/**
 * Variable text anchors test collisions, not viewport bounds. Transparent
 * symbols around the screen turn its edges into collision obstacles, so a
 * clipped name tries its other anchor or gives way. Pins still allow overlap.
 */
export function keepMarketLabelsInsideViewport(map: MapLibreGL.Map): () => void {
  let imageWidth = 0;
  let imageHeight = 0;

  function updateImages(width: number, height: number) {
    if (width === imageWidth && height === imageHeight) return;
    for (const id of [VERTICAL_IMAGE_ID, HORIZONTAL_IMAGE_ID]) {
      if (map.hasImage(id)) map.removeImage(id);
    }
    map.addImage(VERTICAL_IMAGE_ID, {
      width: EDGE_DEPTH,
      height: height + EDGE_DEPTH * 2,
      data: new Uint8Array(EDGE_DEPTH * (height + EDGE_DEPTH * 2) * 4),
    });
    map.addImage(HORIZONTAL_IMAGE_ID, {
      width: width + EDGE_DEPTH * 2,
      height: EDGE_DEPTH,
      data: new Uint8Array((width + EDGE_DEPTH * 2) * EDGE_DEPTH * 4),
    });
    imageWidth = width;
    imageHeight = height;
  }

  function collection() {
    const { clientWidth, clientHeight } = map.getCanvas();
    const width = Math.max(1, clientWidth);
    const height = Math.max(1, clientHeight);
    updateImages(width, height);
    const edges = [
      { x: EDGE_INSET, y: height / 2, image: VERTICAL_IMAGE_ID, anchor: "right" },
      { x: width - EDGE_INSET, y: height / 2, image: VERTICAL_IMAGE_ID, anchor: "left" },
      { x: width / 2, y: EDGE_INSET, image: HORIZONTAL_IMAGE_ID, anchor: "bottom" },
      { x: width / 2, y: height - EDGE_INSET, image: HORIZONTAL_IMAGE_ID, anchor: "top" },
    ];
    return {
      type: "FeatureCollection" as const,
      features: edges.map(({ x, y, image, anchor }) => {
        const point = map.unproject([x, y]);
        return {
          type: "Feature" as const,
          properties: { image, anchor },
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
      "icon-image": ["get", "image"],
      "icon-anchor": ["get", "anchor"],
      "icon-padding": 0,
      "icon-allow-overlap": true,
    },
  });

  function update() {
    const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData(collection());
  }

  map.on("move", update);
  map.on("resize", update);
  return () => {
    map.off("move", update);
    map.off("resize", update);
  };
}
