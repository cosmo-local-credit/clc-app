import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BRAND_PRIMARY_COLOR } from "@clc/core/lib/constants/brand";
import { describe, expect, it } from "vite-plus/test";

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../public");

type Manifest = {
  name: string;
  theme_color: string;
  background_color: string;
  icons: { src: string; purpose: string }[];
};

function readManifest(brand: "prod" | "staging"): Manifest {
  return JSON.parse(readFileSync(path.join(publicDir, `manifest.${brand}.webmanifest`), "utf8"));
}

// The manifest is a static file, not something the bundle can compute, so
// nothing in the type system ties it to VITE_BRAND. It drifted once already:
// the build patched theme-color in the <head> to blue while the manifest —
// which is what Android reads for the install splash and the task switcher —
// stayed green.
describe.each(["prod", "staging"] as const)("%s manifest", (brand) => {
  const manifest = readManifest(brand);

  it("carries the brand primary as its theme colour", () => {
    expect(manifest.theme_color).toBe(BRAND_PRIMARY_COLOR[brand].light);
  });

  it("names the install so both environments can sit on one home screen", () => {
    expect(manifest.name).toBe(brand === "staging" ? "CLC Staging" : "CLC");
  });

  it("points every icon at this brand's own set, and ships each file", () => {
    for (const icon of manifest.icons) {
      expect(icon.src.startsWith(`/brand/${brand}/`)).toBe(true);
      expect(existsSync(path.join(publicDir, icon.src.slice(1)))).toBe(true);
    }
  });

  // A maskable icon is cropped to the launcher's own shape. Declaring one
  // "any maskable" — as the single shared manifest used to — hands Android a
  // rounded tile with transparent corners to crop again.
  it("separates the full-bleed maskable icon from the rounded ones", () => {
    const purposes = manifest.icons.map((icon) => icon.purpose);
    expect(purposes).toContain("maskable");
    expect(purposes).not.toContain("any maskable");
  });

  it("ships the icons referenced from <head> rather than the manifest", () => {
    for (const file of ["logo.svg", "favicon.ico", "apple-touch-icon.png"]) {
      expect(existsSync(path.join(publicDir, "brand", brand, file))).toBe(true);
    }
  });
});
