import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vite-plus/test";

const ROOT = resolve(import.meta.dirname, "..");
const RAW_PASSWORD_TYPE = /type\s*=\s*(?:["']password["']|\{\s*["']password["']\s*\})/g;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (!/\.tsx?$/.test(entry.name) || entry.name.includes(".test.")) return [];
    if (entry.name === "routeTree.gen.ts") return [];
    return [path];
  });
}

describe.each(["web", "admin"])("%s password inputs", (app) => {
  it("routes every statically masked field through PasswordInput", () => {
    const violations = sourceFiles(resolve(ROOT, "apps", app, "src")).flatMap((path) => {
      const matches = readFileSync(path, "utf8").match(RAW_PASSWORD_TYPE) ?? [];
      return matches.map((match) => `${relative(ROOT, path)}: ${match}`);
    });

    expect(violations).toEqual([]);
  });
});
