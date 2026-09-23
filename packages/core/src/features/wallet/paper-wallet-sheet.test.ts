import { describe, expect, it } from "vite-plus/test";
import {
  A4_HEIGHT_MM,
  A4_WIDTH_MM,
  buildPaperWalletSheetPdf,
  CARD_HEIGHT_MM,
  CARD_WIDTH_MM,
  CARDS_PER_SHEET,
  paginatePaperWallets,
  paperWalletCutGuides,
  paperWalletQrRects,
  paperWalletSheetSlots,
} from "./paper-wallet-sheet";

describe("paperWalletSheetSlots", () => {
  const slots = paperWalletSheetSlots();

  it("fits ten CR80 cards on A4 portrait, centred, edge to edge", () => {
    expect(slots).toHaveLength(10);
    const first = slots[0];
    const last = slots[9];
    expect(first?.x).toBeCloseTo((A4_WIDTH_MM - 2 * CARD_WIDTH_MM) / 2);
    expect(first?.y).toBeCloseTo((A4_HEIGHT_MM - 5 * CARD_HEIGHT_MM) / 2);
    expect(slots[1]?.x).toBeCloseTo((first?.x ?? 0) + CARD_WIDTH_MM);
    expect((last?.x ?? 0) + CARD_WIDTH_MM).toBeCloseTo(A4_WIDTH_MM - (first?.x ?? 0));
    expect((last?.y ?? 0) + CARD_HEIGHT_MM).toBeCloseTo(A4_HEIGHT_MM - (first?.y ?? 0));
  });

  it("keeps a margin wide enough for the crop marks", () => {
    expect(slots[0]?.y).toBeGreaterThan(12);
    expect(slots[0]?.x).toBeGreaterThan(12);
  });
});

describe("paginatePaperWallets", () => {
  it("splits into sheets of ten", () => {
    const pages = paginatePaperWallets(Array.from({ length: 23 }, (_, i) => i));
    expect(pages.map((page) => page.length)).toEqual([10, 10, 3]);
    expect(CARDS_PER_SHEET).toBe(10);
  });
});

describe("paperWalletCutGuides", () => {
  it("marks every shared cut of a full sheet in the margins", () => {
    const lines = paperWalletCutGuides(10, { hairlines: false });
    const margin = paperWalletSheetSlots()[0] ?? { x: 0, y: 0 };
    // 3 vertical cuts and 6 horizontal cuts, each marked at both ends.
    expect(lines).toHaveLength((3 + 6) * 2);
    for (const line of lines) {
      const outsideX = line.x2 <= margin.x || line.x1 >= A4_WIDTH_MM - margin.x;
      const outsideY = line.y2 <= margin.y || line.y1 >= A4_HEIGHT_MM - margin.y;
      expect(outsideX || outsideY).toBe(true);
      expect(Math.min(line.x1, line.y1)).toBeGreaterThan(4);
    }
  });

  it("marks only the used grid of a single card and adds hairlines on request", () => {
    expect(paperWalletCutGuides(1, { hairlines: false })).toHaveLength((2 + 2) * 2);
    expect(paperWalletCutGuides(1, { hairlines: true })).toHaveLength((2 + 2) * 3);
    expect(paperWalletCutGuides(0, { hairlines: true })).toEqual([]);
  });
});

describe("buildPaperWalletSheetPdf", () => {
  it("puts ten cards on a sheet and starts a new page for the rest", () => {
    const jpeg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x01, 0x00, 0x01, 0x03, 0x01, 0x11, 0x00,
      0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9,
    ]);
    const cards = Array.from({ length: 12 }, () => ({ jpeg, qr: { size: 1, data: [1] } }));
    const body = new TextDecoder("latin1").decode(
      buildPaperWalletSheetPdf(cards, { hairlines: true }),
    );
    expect(body).toContain("/Count 2");
    expect(body.match(/\/Subtype \/Image/g)).toHaveLength(12);
  });
});

describe("paperWalletQrRects", () => {
  it("merges horizontal runs and maps modules into the card's QR box", () => {
    // 2 x 2: top row fully dark, bottom row only the right module.
    const rects = paperWalletQrRects(
      { size: 2, data: [1, 1, 0, 1] },
      { x: 0, y: 0, width: 600, height: 378 },
    );
    expect(rects).toEqual([
      { x: 340, y: 32, width: 228, height: 114 },
      { x: 454, y: 146, width: 114, height: 114 },
    ]);
  });
});
