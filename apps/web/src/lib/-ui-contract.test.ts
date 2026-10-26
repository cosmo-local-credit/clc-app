import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vite-plus/test";

const SRC = resolve(import.meta.dirname, "..");

/**
 * Arbitrary sizes that stay arbitrary, by file. 1.75rem, the locked page
 * title, is allowed everywhere and is not listed.
 */
const ARBITRARY_SIZE_EXCEPTIONS: Record<string, readonly string[]> = {
  // The amounts being entered keep the sizes master gave them.
  "components/wallet/amount-input.tsx": ["text-[1.375rem]"],
  "features/wallet/ui/send-amount-page.tsx": ["text-[2.5rem]"],
  // Desktop send keeps the amount size from the phone send screen.
  "desktop/wallet/send-desk.tsx": ["text-[2.5rem]"],
};

/**
 * Sizes above the page title, by file. Each is a decorative initial filling an
 * image slot, never text a person reads.
 */
const DISPLAY_SIZE_EXCEPTIONS: Record<string, readonly string[]> = {
  // An offering without a photo: its initials fill the tile and the sheet.
  "components/offerings/offerings-panel.tsx": ["text-3xl", "text-5xl"],
  // The review average keeps master's size.
  "components/reviews/voucher-reviews-panel.tsx": ["text-4xl"],
};

/**
 * Counts master draws in plain Inter with tabular figures. Every other figure
 * is mono or, for a balance, the heading font.
 */
const INTER_COUNT_FILES = new Set([
  "components/catalog-filter-controls.tsx",
  "components/reviews/voucher-reviews-panel.tsx",
  "components/ui/step-progress.tsx",
  "components/ui/tag-badge.tsx",
  "features/home/ui/market-list-page.tsx",
  "features/home/ui/posts-page.tsx",
  "features/pools/ui/pools-page.tsx",
  "features/posts/ui/post-attachment-fields.tsx",
  "features/posts/ui/post-image-manager.tsx",
]);

/** Balances in voucher and token rows, set in the heading font as on master. */
const HEADING_BALANCES: Record<string, string> = {
  "features/home/ui/wallet-page.tsx": "{token.amount}",
  "features/wallet/ui/all-vouchers-page.tsx": "{voucher.amount}",
  "features/wallet/ui/token-picker-sheet.tsx": "{token.amount}",
};

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (!/\.tsx?$/.test(entry.name) || entry.name.includes(".test.")) return [];
    if (entry.name === "routeTree.gen.ts") return [];
    return [path];
  });
}

const FILES = sourceFiles(SRC).map((path) => ({
  path: relative(SRC, path),
  text: readFileSync(path, "utf8"),
}));

function matchesOf(pattern: RegExp, allow: Record<string, readonly string[]>) {
  return FILES.flatMap(({ path, text }) =>
    [...text.matchAll(pattern)]
      .map((match) => match[0])
      .filter((value) => !allow[path]?.includes(value))
      .map((value) => `${path}: ${value}`),
  );
}

/** The text of each opening tag, scanned past `=>` and `>` inside braces. */
function openingTags(text: string, name: string): string[] {
  const tags: string[] = [];
  const start = new RegExp(`<${name}(?=[\\s>])`, "g");
  for (const match of text.matchAll(start)) {
    let depth = 0;
    let quote: string | null = null;
    for (let index = match.index + match[0].length; index < text.length; index++) {
      const char = text[index];
      if (quote) {
        if (char === quote) quote = null;
      } else if (char === '"' || char === "'" || char === "`") {
        quote = char;
      } else if (char === "{") {
        depth++;
      } else if (char === "}") {
        depth--;
      } else if (char === ">" && depth === 0) {
        tags.push(text.slice(match.index, index + 1));
        break;
      }
    }
  }
  return tags;
}

/** The stylesheet with every `@layer` block cut out, leaving what outranks the utilities. */
function unlayeredStyles(): string {
  const css = readFileSync(resolve(SRC, "styles.css"), "utf8");
  let out = "";
  let index = 0;
  for (const match of css.matchAll(/@layer[^{;]*\{/g)) {
    if (match.index < index) continue;
    out += css.slice(index, match.index);
    let depth = 0;
    for (index = match.index; index < css.length; index++) {
      if (css[index] === "{") depth++;
      else if (css[index] === "}" && --depth === 0) break;
    }
    index++;
  }
  return out + css.slice(index);
}

describe("type and button contract", () => {
  it("leaves border colour to the base layer, so a border utility can win", () => {
    // An unlayered `border-color` outranks every layered utility: it greyed
    // out each outline, focus and error border and drew a divider inside the
    // market search field.
    expect(unlayeredStyles().match(/(?<![-\w])border-color\s*:[^;]*/g) ?? []).toEqual([]);
  });

  it("draws text sizes from the scale, not arbitrary values", () => {
    expect(
      matchesOf(/\btext-\[(?:\d|\.)[^\]]*\]/g, ARBITRARY_SIZE_EXCEPTIONS).filter(
        (match) => !match.endsWith("text-[1.75rem]"),
      ),
    ).toEqual([]);
  });

  it("draws figures in mono or the heading font, never Inter tabular-nums", () => {
    const inter = FILES.flatMap(({ path, text }) =>
      INTER_COUNT_FILES.has(path)
        ? []
        : [...text.matchAll(/["'`][^"'`]*\btabular-nums\b[^"'`]*["'`]/g)]
            .map((match) => match[0])
            .filter((value) => !/\bfont-(?:mono|heading)\b/.test(value))
            .map((value) => `${path}: ${value}`),
    );
    expect(inter).toEqual([]);
  });

  it("sets each row balance in the heading font, as master does", () => {
    const wrong = Object.entries(HEADING_BALANCES).flatMap(([path, expression]) => {
      const text = FILES.find((file) => file.path === path)?.text ?? "";
      const index = text.indexOf(expression);
      const tag = text.slice(text.lastIndexOf("<", index), index);
      return index >= 0 && /font-heading/.test(tag) && /tracking-tight/.test(tag) ? [] : [path];
    });
    expect(wrong).toEqual([]);
  });

  it("sets nothing larger than the page title", () => {
    expect(matchesOf(/\btext-(?:[3-9]xl)\b/g, DISPLAY_SIZE_EXCEPTIONS)).toEqual([]);
  });

  it("keeps 44px text buttons to the ones beside a 44px control", () => {
    const allowed = new Set([
      // Credit and Sign in match the market search field.
      "components/creditable-browse-control.tsx",
      "components/market-bar.tsx",
      // The pool's three quick actions.
      "features/pools/ui/pool-detail-page.tsx",
      // The desktop top bar's search sits beside the 44px icon buttons.
      "desktop/shell/top-bar.tsx",
    ]);
    const large = FILES.flatMap(({ path, text }) =>
      allowed.has(path)
        ? []
        : openingTags(text, "Button")
            .filter((tag) => /\ssize=(?:"lg"|\{[^}]*"lg")/.test(tag))
            .map(() => path),
    );
    expect(large).toEqual([]);
  });

  it("takes a button's height from its size prop, not a class", () => {
    const sized = FILES.flatMap(({ path, text }) =>
      ["Button", "Toggle"].flatMap((name) =>
        openingTags(text, name).flatMap((tag) =>
          // Height, square size and minimum height on the control itself; a
          // child selector such as [&_svg]:size-5 sizes an icon, not the button.
          [...tag.matchAll(/(?<=["'`\s])(?:[\w-]+:)*(?:min-h|h|size)-[\w.[\]/()-]+/g)].map(
            (match) => `${path}: <${name} ${match[0]}`,
          ),
        ),
      ),
    );
    expect(sized).toEqual([]);
  });
});
