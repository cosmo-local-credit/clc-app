import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vite-plus/test";

const SRC = resolve(import.meta.dirname, "..");

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return files(path);
    if (!/\.tsx?$/.test(entry.name)) return [];
    return [path];
  });
}

describe("desktop import boundary", () => {
  it("lets only route files and the desktop layer import #/desktop", () => {
    const leaks = files(SRC).flatMap((path) => {
      const rel = relative(SRC, path);
      if (rel.startsWith("desktop/") || rel.startsWith("routes/")) return [];
      const text = readFileSync(path, "utf8");
      return text.includes("#/desktop") ? [rel] : [];
    });
    expect(leaks).toEqual([]);
  });
});
