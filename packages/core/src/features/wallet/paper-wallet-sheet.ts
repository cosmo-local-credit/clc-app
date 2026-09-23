import { createPdf, type PdfLine, type PdfRect } from "../../lib/pdf/pdf-writer";

/**
 * Print imposition for paper wallets: credit-card sized cards on A4.
 *
 * A card is ISO/IEC 7810 ID-1 (CR80), the size of a bank card, so it fits a
 * wallet and a standard laminating pouch. A4 portrait holds a 2 x 5 grid of
 * them (171.2 x 269.9 mm); landscape holds only 3 x 3. The cards sit edge to
 * edge so neighbours share a cut: six horizontal and three vertical passes on a
 * guillotine or rotary trimmer separate a full sheet. Crop marks sit in the
 * margins, outside the grid, where a trimmer's blade is lined up.
 */

export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;
export const CARD_WIDTH_MM = 85.6;
export const CARD_HEIGHT_MM = 53.98;
const SHEET_COLUMNS = 2;
const SHEET_ROWS = 5;
export const CARDS_PER_SHEET = SHEET_COLUMNS * SHEET_ROWS;

const GRID_LEFT_MM = (A4_WIDTH_MM - SHEET_COLUMNS * CARD_WIDTH_MM) / 2;
const GRID_TOP_MM = (A4_HEIGHT_MM - SHEET_ROWS * CARD_HEIGHT_MM) / 2;

/** Gap between a crop mark and the card edge, so the mark is never on the card. */
const MARK_GAP_MM = 2;
/** Short enough to stay clear of a printer's unprintable edge (~4 mm). */
const MARK_LENGTH_MM = 6;
const MARK_WIDTH_MM = 0.2;
const HAIRLINE_WIDTH_MM = 0.1;
const MARK_COLOR = [0, 0, 0] as const;
const HAIRLINE_COLOR = [0.78, 0.78, 0.78] as const;

/**
 * The card's design space. Both apps render the card at this fixed size and the
 * sheet scales it to CR80; the QR box is where the vector QR is overlaid.
 */
export const PAPER_WALLET_CARD_WIDTH = 600;
export const PAPER_WALLET_CARD_HEIGHT = 378;
export const PAPER_WALLET_QR_BOX = { x: 340, y: 32, size: 228 } as const;

export type SheetSlot = { x: number; y: number; width: number; height: number };

/** Card positions on one sheet, row-major from the top-left. */
export function paperWalletSheetSlots(): SheetSlot[] {
  return Array.from({ length: CARDS_PER_SHEET }, (_, index) => ({
    x: GRID_LEFT_MM + (index % SHEET_COLUMNS) * CARD_WIDTH_MM,
    y: GRID_TOP_MM + Math.floor(index / SHEET_COLUMNS) * CARD_HEIGHT_MM,
    width: CARD_WIDTH_MM,
    height: CARD_HEIGHT_MM,
  }));
}

export function paginatePaperWallets<T>(items: readonly T[]): T[][] {
  const pages: T[][] = [];
  for (let start = 0; start < items.length; start += CARDS_PER_SHEET) {
    pages.push(items.slice(start, start + CARDS_PER_SHEET));
  }
  return pages;
}

/**
 * Crop marks, and optionally hairlines, for the first `count` slots of a sheet.
 *
 * Marks cover only the rows and columns in use, so a half-filled last sheet is
 * not cut along lines with no card on either side. Hairlines run along every
 * cut through the used grid for anyone cutting with scissors; a trimmer cuts
 * them away with the edge.
 */
export function paperWalletCutGuides(count: number, options: { hairlines: boolean }): PdfLine[] {
  if (count <= 0) return [];
  const used = Math.min(count, CARDS_PER_SHEET);
  const columns = Math.min(used, SHEET_COLUMNS);
  const rows = Math.ceil(used / SHEET_COLUMNS);
  const left = GRID_LEFT_MM;
  const top = GRID_TOP_MM;
  const right = left + columns * CARD_WIDTH_MM;
  const bottom = top + rows * CARD_HEIGHT_MM;
  const lines: PdfLine[] = [];
  const mark = (x1: number, y1: number, x2: number, y2: number) =>
    lines.push({ x1, y1, x2, y2, width: MARK_WIDTH_MM, color: MARK_COLOR });
  const hairline = (x1: number, y1: number, x2: number, y2: number) =>
    lines.push({ x1, y1, x2, y2, width: HAIRLINE_WIDTH_MM, color: HAIRLINE_COLOR });

  for (let column = 0; column <= columns; column++) {
    const x = left + column * CARD_WIDTH_MM;
    mark(x, top - MARK_GAP_MM - MARK_LENGTH_MM, x, top - MARK_GAP_MM);
    mark(x, bottom + MARK_GAP_MM, x, bottom + MARK_GAP_MM + MARK_LENGTH_MM);
    if (options.hairlines) hairline(x, top, x, bottom);
  }
  for (let row = 0; row <= rows; row++) {
    const y = top + row * CARD_HEIGHT_MM;
    mark(left - MARK_GAP_MM - MARK_LENGTH_MM, y, left - MARK_GAP_MM, y);
    mark(right + MARK_GAP_MM, y, right + MARK_GAP_MM + MARK_LENGTH_MM, y);
    if (options.hairlines) hairline(left, y, right, y);
  }
  return lines;
}

export type QrModules = { size: number; data: ArrayLike<number | boolean> };

/**
 * The dark modules of a QR code as rectangles over the card's QR box in `slot`.
 *
 * Drawing the code as vectors keeps every module edge sharp at any printer
 * resolution, where a raster QR would be resampled. Horizontal runs are merged
 * into one rectangle to keep the page content small.
 */
export function paperWalletQrRects(modules: QrModules, slot: SheetSlot): PdfRect[] {
  const scaleX = slot.width / PAPER_WALLET_CARD_WIDTH;
  const scaleY = slot.height / PAPER_WALLET_CARD_HEIGHT;
  const moduleW = (PAPER_WALLET_QR_BOX.size * scaleX) / modules.size;
  const moduleH = (PAPER_WALLET_QR_BOX.size * scaleY) / modules.size;
  const originX = slot.x + PAPER_WALLET_QR_BOX.x * scaleX;
  const originY = slot.y + PAPER_WALLET_QR_BOX.y * scaleY;
  const rects: PdfRect[] = [];

  for (let row = 0; row < modules.size; row++) {
    let column = 0;
    while (column < modules.size) {
      if (!modules.data[row * modules.size + column]) {
        column++;
        continue;
      }
      const start = column;
      while (column < modules.size && modules.data[row * modules.size + column]) column++;
      rects.push({
        x: originX + start * moduleW,
        y: originY + row * moduleH,
        width: (column - start) * moduleW,
        height: moduleH,
      });
    }
  }
  return rects;
}

export type PrintableCard = {
  /** The card rendered at its design size, without the QR. */
  jpeg: Uint8Array;
  qr: QrModules;
};

/**
 * The A4 PDF for a set of cards: each card's raster at CR80 size with its QR
 * drawn as vectors on top, then the cut guides for the sheet.
 */
export function buildPaperWalletSheetPdf(
  cards: readonly PrintableCard[],
  options: { hairlines: boolean; title?: string },
): Uint8Array<ArrayBuffer> {
  const slots = paperWalletSheetSlots();
  return createPdf({
    widthMm: A4_WIDTH_MM,
    heightMm: A4_HEIGHT_MM,
    title: options.title,
    pages: paginatePaperWallets(cards).map((pageCards) => {
      // A page never holds more cards than there are slots.
      const placed = pageCards.map((card, index) => ({ card, slot: slots[index] as SheetSlot }));
      return {
        images: placed.map(({ card, slot }) => ({ jpeg: card.jpeg, ...slot })),
        rects: placed.flatMap(({ card, slot }) => paperWalletQrRects(card.qr, slot)),
        lines: paperWalletCutGuides(pageCards.length, { hairlines: options.hairlines }),
      };
    }),
  });
}
