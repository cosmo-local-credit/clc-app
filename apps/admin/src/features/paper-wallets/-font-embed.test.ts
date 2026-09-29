import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { embedCardFonts } from "./font-embed";

describe("embedCardFonts", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("fetches only subsets covering visible card text", async () => {
    const stylesheet = {
      href: "https://example.test/card.css",
      cssRules: [],
    } as unknown as CSSStyleSheet;
    const face = (url: string, range: string) =>
      ({
        type: CSSRule.FONT_FACE_RULE,
        cssText: `@font-face { font-family: "Inter Variable"; src: url("${url}"); unicode-range: ${range}; }`,
        style: { fontFamily: '"Inter Variable"' },
        parentStyleSheet: stylesheet,
      }) as CSSFontFaceRule;
    const faces = [
      face("/test-latin.woff2", "U+0000-00FF"),
      face("/test-cyrillic.woff2", "U+0400-045F"),
    ];
    Object.defineProperty(stylesheet, "cssRules", { value: faces });
    vi.spyOn(document, "styleSheets", "get").mockReturnValue([
      stylesheet,
    ] as unknown as StyleSheetList);
    const fetchFont = vi.fn(async () => ({
      ok: true,
      blob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: "font/woff2" }),
    }));
    vi.stubGlobal("fetch", fetchFont);

    const css = await embedCardFonts("Name");

    expect(fetchFont).toHaveBeenCalledTimes(1);
    expect(fetchFont).toHaveBeenCalledWith("https://example.test/test-latin.woff2");
    expect(css).toContain("data:font/woff2;base64,");
    expect(css).not.toContain("test-cyrillic.woff2");
  });
});
