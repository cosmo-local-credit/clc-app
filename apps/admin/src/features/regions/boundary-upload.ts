import { type RegionBoundary, regionBoundarySchema } from "@clc/core/features/regions/logic";
import { z } from "zod";

// Leave headroom below the server's 1 MiB write body limit for metadata.
const MAX_BYTES = 1_000_000;
const feature = z.object({
  type: z.literal("Feature"),
  geometry: regionBoundarySchema,
  crs: z.never().optional(),
});
const collection = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(feature).min(1),
  crs: z.never().optional(),
});

function readGeoJSON(text: string): RegionBoundary {
  const data: unknown = JSON.parse(text);
  const decoded = z.union([regionBoundarySchema, feature, collection]).parse(data);
  if (decoded.type === "Feature") return decoded.geometry;
  if (decoded.type !== "FeatureCollection") return decoded;
  return {
    type: "MultiPolygon",
    coordinates: decoded.features.flatMap(({ geometry }) =>
      geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates,
    ),
  };
}

function child(element: Element, name: string): Element | undefined {
  return Array.from(element.children).find((item) => item.localName === name);
}

function readKML(text: string): RegionBoundary {
  if (/<!\s*(DOCTYPE|ENTITY)/i.test(text))
    throw new Error("Document declarations are not supported.");
  const document = new DOMParser().parseFromString(text, "application/xml");
  if (
    document.documentElement.localName !== "kml" ||
    document.getElementsByTagName("parsererror").length
  ) {
    throw new Error("Invalid KML.");
  }
  function coordinates(element: Element | undefined) {
    const linearRing = element && child(element, "LinearRing");
    const text = linearRing && child(linearRing, "coordinates")?.textContent?.trim();
    if (!text) throw new Error("Missing boundary coordinates.");
    return text.split(/\s+/).map((point) => {
      const [lng, lat] = point.split(",");
      if (!lng || !lat) throw new Error("Missing coordinate.");
      return [Number(lng), Number(lat)];
    });
  }
  return regionBoundarySchema.parse({
    type: "MultiPolygon",
    coordinates: Array.from(document.getElementsByTagNameNS("*", "Polygon")).map((area) => [
      coordinates(child(area, "outerBoundaryIs")),
      ...Array.from(area.children)
        .filter((item) => item.localName === "innerBoundaryIs")
        .map(coordinates),
    ]),
  });
}

export async function readRegionBoundary(file: File): Promise<RegionBoundary> {
  if (file.size > MAX_BYTES) throw new Error("Select a boundary file no larger than 1 MB.");
  try {
    const text = await file.text();
    return file.name.toLowerCase().endsWith(".kml") ? readKML(text) : readGeoJSON(text);
  } catch {
    throw new Error(
      "Upload a valid GeoJSON or KML file containing closed polygon boundaries in WGS84.",
    );
  }
}
