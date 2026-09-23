import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({ toJpeg: vi.fn(), getFontEmbedCSS: vi.fn() }));
vi.mock("html-to-image", () => mocks);

import { clampLines, fontFacesCovering, renderPaperWalletSheet } from "./render-sheet";
import { PAPER_WALLET_NAME_TEXT } from "./ui/paper-wallet-card";

/** A valid 1 x 1 RGB JPEG header carrying `padding` bytes in an APP1 segment. */
function jpeg(padding: number): Uint8Array<ArrayBuffer> {
  const app1 = [0xff, 0xe1, ((padding + 2) >> 8) & 0xff, (padding + 2) & 0xff];
  const sof = [
    0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x01, 0x00, 0x01, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01,
    0x03, 0x11, 0x01,
  ];
  const zeros = Array.from({ length: padding }, () => 0);
  return new Uint8Array([0xff, 0xd8, ...app1, ...zeros, ...sof, 0xff, 0xd9]);
}

function dataUrl(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:image/jpeg;base64,${btoa(binary)}`;
}

/** 60 KB, in the range of a real rasterised card. */
const BACKGROUND_BYTES = 60_000;
const STRIP = jpeg(16);

/** Ten pixels per character, so line breaking is predictable. */
const measure = (text: string) => Array.from(text).length * 10;

function stubCanvas() {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    return {
      canvas: this,
      setTransform: vi.fn(),
      fillRect: vi.fn(),
      fillText: vi.fn(),
      measureText: (text: string) => ({
        width: measure(text),
        fontBoundingBoxAscent: 20,
        fontBoundingBoxDescent: 5,
      }),
    } as unknown as CanvasRenderingContext2D;
  } as unknown as HTMLCanvasElement["getContext"]);
}

async function pdfText(blob: Blob): Promise<string> {
  return new TextDecoder("latin1").decode(await blob.arrayBuffer());
}

const DESIGN = { website: "cosmolocal.credit", description: "", logoDataUrl: null };
const wallet = (name: string) => ({
  address: `0x${"a".repeat(40)}`,
  name,
  qrUrl: "https://cosmolocal.credit/?w=key",
});

describe("renderPaperWalletSheet", () => {
  const toBlobCalls = vi.fn();

  beforeEach(() => {
    toBlobCalls.mockClear();
    mocks.toJpeg.mockReset().mockResolvedValue(dataUrl(jpeg(BACKGROUND_BYTES)));
    mocks.getFontEmbedCSS.mockReset().mockResolvedValue("");
    stubCanvas();
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => {
      toBlobCalls();
      callback(new Blob([STRIP], { type: "image/jpeg" }));
    });
    HTMLImageElement.prototype.decode = () => Promise.resolve();
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { load: vi.fn().mockResolvedValue([]) },
    });
  });

  afterEach(() => vi.restoreAllMocks());

  const fullBatch = Array.from({ length: 500 }, () => wallet("Amina Wanjiru"));

  it("rasterises the card design once for a full batch and embeds it once", async () => {
    const onProgress = vi.fn();
    const blob = await renderPaperWalletSheet(fullBatch, DESIGN, { hairlines: true, onProgress });

    expect(mocks.toJpeg).toHaveBeenCalledTimes(1);
    expect(mocks.getFontEmbedCSS).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenLastCalledWith(500);

    const body = await pdfText(blob);
    expect(body).toContain("/Count 50");
    // One shared background and name, then one unique address strip per card.
    expect(body.match(/\/Subtype \/Image/g)).toHaveLength(2 + 500);
    expect(toBlobCalls).toHaveBeenCalledTimes(1 + 500);

    // The background's bytes are paid once, not per card: rasterising every
    // card put them in the file 500 times, 30 MB for this background alone.
    mocks.toJpeg.mockResolvedValue(dataUrl(jpeg(0)));
    const bare = await renderPaperWalletSheet(fullBatch, DESIGN, { hairlines: true });
    // The only other difference is the longer `/Length` it is declared with.
    expect(blob.size - bare.size).toBe(BACKGROUND_BYTES + String(BACKGROUND_BYTES).length - 2);
  });

  it("gives write-in, one-line and two-line cards a background each", async () => {
    const blob = await renderPaperWalletSheet(
      [wallet(""), wallet("Amina"), wallet("Amina Wanjiru Mwangi Otieno Kamau"), wallet("")],
      DESIGN,
      { hairlines: false },
    );

    expect(mocks.toJpeg).toHaveBeenCalledTimes(3);
    const body = await pdfText(blob);
    // Three backgrounds; write-in cards carry only their address strip.
    expect(body.match(/\/Subtype \/Image/g)).toHaveLength(3 + (1 + 2 + 2 + 1));
  });
});

describe("clampLines", () => {
  // No letter spacing, so a line's width is exactly ten pixels a character.
  const style = { ...PAPER_WALLET_NAME_TEXT, letterSpacingEm: 0 };
  beforeEach(stubCanvas);
  afterEach(() => vi.restoreAllMocks());

  it("wraps at words within the width", () => {
    expect(clampLines("Amina Wanjiru Mwangi", style, 140, 2)).toEqual(["Amina Wanjiru", "Mwangi"]);
  });

  it("breaks a word too long for a line", () => {
    expect(clampLines("Wanjirumwangi", style, 50, 3)).toEqual(["Wanji", "rumwa", "ngi"]);
  });

  it("ends the last line with an ellipsis when the text runs past it", () => {
    expect(clampLines("Amina Wanjiru Mwangi Otieno Kamau", style, 140, 2)).toEqual([
      "Amina Wanjiru",
      "Mwangi Otieno\u2026",
    ]);
  });

  it("returns no lines for a blank name, so the card gets a write-in line", () => {
    expect(clampLines("   ", style, 300, 2)).toEqual([]);
  });
});

describe("fontFacesCovering", () => {
  const latin = `@font-face { font-family: "Inter Variable"; src: url(a); unicode-range: U+0000-00FF, U+0131; }`;
  const cyrillic = `@font-face { font-family: "Inter Variable"; src: url(b); unicode-range: U+0400-045F; }`;

  it("keeps only the subsets the text uses", () => {
    expect(fontFacesCovering(`${latin}\n${cyrillic}`, "cosmolocal.credit")).toBe(`${latin}\n`);
    expect(fontFacesCovering(`${latin}\n${cyrillic}`, "Жанна")).toBe(cyrillic);
  });
});
