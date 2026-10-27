import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { LayerSpecification, StyleSpecification } from "maplibre-gl";
import { validateStyle } from "maplibre-gl/src/style/validate_style";
import { describe, expect, it } from "vite-plus/test";

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../public");
const style = JSON.parse(
  readFileSync(path.join(publicDir, "map-styles/liberty-dark.json"), "utf8"),
) as StyleSpecification;
const layersById = new Map(style.layers.map((layer) => [layer.id, layer]));

function layer(id: string): LayerSpecification {
  const value = layersById.get(id);
  if (!value) throw new Error(`Missing map layer: ${id}`);
  return value;
}

describe("dark Liberty map style", () => {
  it("is a valid MapLibre style", () => {
    expect(validateStyle(style).map((error) => error.message)).toEqual([]);
  });

  it("uses OpenFreeMap's public vector, sprite, and glyph resources", () => {
    expect(style.sources.openmaptiles).toEqual({
      type: "vector",
      url: "https://tiles.openfreemap.org/planet",
    });
    expect(style.sprite).toBe("https://tiles.openfreemap.org/sprites/ofm_f384/ofm");
    expect(style.glyphs).toBe("https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf");
  });

  it("retains Liberty's detailed buildings and points of interest", () => {
    expect(style.layers).toHaveLength(111);
    expect(layer("building")).toMatchObject({ type: "fill", minzoom: 13 });
    expect(layer("building-3d")).toMatchObject({ type: "fill-extrusion", minzoom: 14 });
    expect(layer("poi_r1")).toMatchObject({ type: "symbol", minzoom: 15 });
    expect(layer("poi_r7")).toMatchObject({ type: "symbol", minzoom: 16 });
    expect(layer("poi_r20")).toMatchObject({ type: "symbol", minzoom: 17 });
    expect(layer("poi_transit")).toMatchObject({ type: "symbol" });
  });

  it("retains road, transit, water, airport, and place labels", () => {
    for (const id of [
      "highway-name-minor",
      "highway-name-major",
      "waterway_line_label",
      "water_name_point_label",
      "airport",
      "label_village",
      "label_city",
      "label_country_1",
    ]) {
      expect(layer(id).type).toBe("symbol");
    }
  });

  it("gives buildings and labels visible dark-map contrast", () => {
    expect(layer("background")).toMatchObject({
      type: "background",
      paint: { "background-color": "#45516e" },
    });
    expect(layer("building").paint).toMatchObject({
      "fill-color": "#65718b",
      "fill-outline-color": "#9aa5bb",
    });
    expect(layer("poi_r1").paint).toMatchObject({
      "text-color": "#f4f4f5",
      "text-halo-color": "#151a28",
      "text-halo-width": 1.5,
    });
  });
});
