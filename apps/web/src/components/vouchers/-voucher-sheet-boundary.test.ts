import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vite-plus/test";

const SOURCE_ROOT = resolve(import.meta.dirname, "../..");

function productionTsxFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return productionTsxFiles(path);
    if (!entry.name.endsWith(".tsx") || entry.name.includes(".test.")) return [];
    return [path];
  });
}

function importers(specifier: string): string[] {
  return productionTsxFiles(SOURCE_ROOT)
    .filter((file) => readFileSync(file, "utf8").includes(`from "${specifier}"`))
    .map((file) => relative(SOURCE_ROOT, file))
    .sort();
}

describe("voucher sheet boundary", () => {
  it("mounts the voucher sheet only on the Marketplace map", () => {
    expect(importers("#/components/vouchers/voucher-sheet")).toEqual([
      "features/home/ui/market-page.tsx",
    ]);
  });

  it("keeps sheet URL selection inside the map implementation", () => {
    expect(importers("#/lib/navigation/use-voucher-sheet-selection")).toEqual([
      "components/vouchers/voucher-sheet.tsx",
      "features/home/ui/market-page.tsx",
    ]);
  });
});
