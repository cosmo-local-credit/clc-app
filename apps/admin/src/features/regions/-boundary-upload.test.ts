import { describe, expect, it } from "vite-plus/test";
import { readRegionBoundary } from "./boundary-upload";

const ring = [
  [88, 26],
  [92, 26],
  [92, 29],
  [88, 26],
];
const polygon = { type: "Polygon", coordinates: [ring] };

function file(name: string, text: string) {
  return new File([text], name);
}

describe("Region boundary upload", () => {
  it("accepts polygons, preserving all features in a collection", async () => {
    const shape = { type: "Feature", geometry: polygon };
    const source = JSON.stringify({ type: "FeatureCollection", features: [shape, shape] });
    await expect(readRegionBoundary(file("boundary.geojson", source))).resolves.toEqual({
      type: "MultiPolygon",
      coordinates: [[ring], [ring]],
    });
  });

  it("accepts a namespaced KML polygon with altitude ignored", async () => {
    const source =
      '<kml xmlns="http://www.opengis.net/kml/2.2"><Placemark><Polygon><outerBoundaryIs><LinearRing><coordinates>88,26,0 92,26,2 92,29,0 88,26,0</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></kml>';
    await expect(readRegionBoundary(file("boundary.kml", source))).resolves.toEqual({
      type: "MultiPolygon",
      coordinates: [[ring]],
    });
  });

  it("rejects open rings and KML that declares external document content", async () => {
    const openRing = JSON.stringify({
      ...polygon,
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [1, 2],
        ],
      ],
    });
    await expect(readRegionBoundary(file("open.json", openRing))).rejects.toThrow(
      "closed polygon boundaries",
    );
    await expect(
      readRegionBoundary(
        file(
          "doctype.kml",
          '<?xml version="1.0"?><!DOCTYPE kml SYSTEM "file:///never-read"><kml/>',
        ),
      ),
    ).rejects.toThrow("closed polygon boundaries");
  });

  it("rejects an oversized file before reading it", async () => {
    await expect(readRegionBoundary(file("big.json", " ".repeat(1_000_001)))).rejects.toThrow(
      "no larger than 1 MB",
    );
  });

  it("rejects explicit coordinate systems without reinterpreting them as WGS84", async () => {
    const crs = { type: "name", properties: { name: "EPSG:3857" } };
    const geometry = { ...polygon, crs };
    const feature = { type: "Feature", geometry: polygon, crs };
    const collection = {
      type: "FeatureCollection",
      features: [{ ...feature, crs: undefined }],
      crs,
    };
    for (const source of [geometry, feature, collection]) {
      await expect(
        readRegionBoundary(file("projected.json", JSON.stringify(source))),
      ).rejects.toThrow("WGS84");
    }
  });
});
