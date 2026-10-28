/** The three families used by the paper card, as declared by fontsource. */
const CARD_FAMILIES = new Set([
  "Inter Variable",
  "Plus Jakarta Sans Variable",
  "JetBrains Mono Variable",
]);

const fontDataUrls = new Map<string, Promise<string>>();

/** Keep only font-face rules whose unicode range covers text on the card. */
export function fontFacesCovering(css: string, text: string): string {
  const codePoints = Array.from(new Set(text), (char) => char.codePointAt(0) ?? 0);
  return css
    .split(/(?=@font-face)/)
    .filter((rule) => {
      const ranges = /unicode-range:\s*([^;}]+)/.exec(rule)?.[1];
      if (!ranges) return true;
      return ranges.split(",").some((range) => {
        const [low = "", high = low] = range.trim().replace(/^U\+/i, "").split("-");
        const from = Number.parseInt(low.replaceAll("?", "0"), 16);
        const to = Number.parseInt(high.replaceAll("?", "F"), 16);
        return codePoints.some((point) => point >= from && point <= to);
      });
    })
    .join("");
}

function fontRules(): CSSFontFaceRule[] {
  const faces: CSSFontFaceRule[] = [];
  const visit = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules)) {
      if (rule.type === CSSRule.FONT_FACE_RULE) faces.push(rule as CSSFontFaceRule);
      else if (rule.type === CSSRule.IMPORT_RULE) {
        const imported = (rule as CSSImportRule).styleSheet;
        if (imported) {
          try {
            visit(imported.cssRules);
          } catch {
            // A cross-origin sheet cannot be inspected by the page.
          }
        }
      } else if ("cssRules" in rule) {
        visit((rule as CSSGroupingRule).cssRules);
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      visit(sheet.cssRules);
    } catch {
      // The card fonts are served by this app; unrelated cross-origin CSS is ignored.
    }
  }
  return faces;
}

async function fontDataUrl(url: string): Promise<string> {
  let cached = fontDataUrls.get(url);
  if (!cached) {
    cached = (async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error("The sign-in card print font could not be loaded");
      const blob = await response.blob();
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
          typeof reader.result === "string"
            ? resolve(reader.result)
            : reject(new Error("The sign-in card print font could not be read"));
        reader.onerror = () =>
          reject(reader.error ?? new Error("The print font could not be read"));
        reader.readAsDataURL(blob);
      });
    })();
    fontDataUrls.set(url, cached);
  }
  try {
    return await cached;
  } catch (error) {
    fontDataUrls.delete(url);
    throw error;
  }
}

/**
 * Select font subsets before fetching their files. html-to-image does this in
 * the opposite order and base64-encodes every fontsource subset on the page.
 */
export async function embedCardFonts(text: string): Promise<string> {
  const selected = fontRules().filter((rule) => {
    const family = rule.style.fontFamily.replaceAll(/["']/g, "").trim();
    return (
      CARD_FAMILIES.has(family) && fontFacesCovering(rule.cssText, text).includes("@font-face")
    );
  });
  return (
    await Promise.all(
      selected.map(async (rule) => {
        let css = rule.cssText;
        const urls = Array.from(css.matchAll(/url\(\s*(["']?)([^"')]+)\1\s*\)/g));
        for (const match of urls) {
          const raw = match[2];
          if (!raw || raw.startsWith("data:")) continue;
          const absolute = new URL(raw, rule.parentStyleSheet?.href ?? document.baseURI).href;
          css = css.replace(match[0], `url("${await fontDataUrl(absolute)}")`);
        }
        return css;
      }),
    )
  ).join("\n");
}
