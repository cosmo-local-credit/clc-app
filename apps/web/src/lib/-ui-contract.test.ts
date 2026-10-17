import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vite-plus/test";

const SRC = resolve(import.meta.dirname, "..");

/**
 * Arbitrary sizes that stay arbitrary, by file. 1.75rem, the locked page
 * title, is allowed everywhere and is not listed.
 */
const ARBITRARY_SIZE_EXCEPTIONS: Record<string, readonly string[]> = {};

/**
 * Sizes above the page title, by file. Each is a decorative initial filling an
 * image slot, never text a person reads.
 */
const DISPLAY_SIZE_EXCEPTIONS: Record<string, readonly string[]> = {
  // An offering without a photo: its initials fill the tile and the sheet.
  "components/offerings/offerings-panel.tsx": ["text-3xl", "text-5xl"],
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

describe("type and button contract", () => {
  it("draws text sizes from the scale, not arbitrary values", () => {
    expect(
      matchesOf(/\btext-\[(?:\d|\.)[^\]]*\]/g, ARBITRARY_SIZE_EXCEPTIONS).filter(
        (match) => !match.endsWith("text-[1.75rem]"),
      ),
    ).toEqual([]);
  });

  it("sets nothing larger than the page title", () => {
    expect(matchesOf(/\btext-(?:[3-9]xl)\b/g, DISPLAY_SIZE_EXCEPTIONS)).toEqual([]);
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
