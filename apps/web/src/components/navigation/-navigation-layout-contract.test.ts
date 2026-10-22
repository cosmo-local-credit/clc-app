import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vite-plus/test";

const SRC = resolve(import.meta.dirname, "../..");

function source(path: string) {
  return readFileSync(resolve(SRC, path), "utf8");
}

describe("bottom-navigation layout contract", () => {
  it("preserves safe-area clearance for navigation content and map controls", () => {
    const styles = source("styles.css");
    const marketMap = source("features/home/ui/market-page.tsx");

    expect(styles).toContain("--bottom-nav-offset: 0px");
    expect(styles).toContain("@utility pb-bottom-nav");
    expect(styles).toContain("calc(var(--bottom-nav-offset) + 0.75rem)");
    expect(
      marketMap.match(/max\(var\(--bottom-nav-offset\),env\(safe-area-inset-bottom\)\)\+1\.25rem/g),
    ).toHaveLength(1);
    expect(styles).not.toContain("@utility pb-market-list");
  });

  it("reserves the desktop scrollbar gutter so fixed navigation does not shift", () => {
    const styles = source("styles.css");

    expect(styles).toMatch(/html\s*\{\s*scrollbar-gutter:\s*stable;/);
  });

  it("stacks navigation below shared backdrops and popup content", () => {
    const navigation = source("components/navigation/bottom-navigation.tsx");
    const sheet = source("components/ui/sheet.tsx");
    const dialog = source("components/ui/dialog.tsx");
    const report = source("features/home/ui/report-page.tsx");

    expect(navigation).toContain("bottom-0 z-30");
    expect(sheet).toContain("fixed inset-0 z-40");
    // The drawer viewport carries the popup's stacking context.
    expect(sheet).toContain("fixed inset-0 z-50");
    expect(dialog).toContain("fixed inset-0 z-40");
    expect(dialog).toContain("left-1/2 z-50");
    expect(report).toContain('<DialogBackdrop className="bg-black" />');
  });
});
