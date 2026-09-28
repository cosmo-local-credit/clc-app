import { layoutWithLines, measureNaturalWidth, prepareWithSegments } from "@chenglou/pretext";
import { dataUrlBytes } from "@clc/core/lib/data-url";
import {
  type CardOverlay,
  PAPER_WALLET_CARD_HEIGHT,
  PAPER_WALLET_CARD_WIDTH,
} from "@clc/core/features/wallet/paper-wallet-sheet";
import { toJpeg } from "html-to-image";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import { assemblePaperWalletPdfInWorker, type PreparedCard } from "./assemble-pdf";
import { embedCardFonts } from "./font-embed";
import {
  type CardTextStyle,
  PAPER_WALLET_ADDRESS_TEXT,
  PAPER_WALLET_INK,
  PAPER_WALLET_NAME_LINES,
  PAPER_WALLET_NAME_TEXT,
  PAPER_WALLET_NAME_WIDTH,
  PAPER_WALLET_PIXEL_RATIO,
  PaperWalletCard,
  type PaperWalletCardDesign,
} from "./ui/paper-wallet-card";

export type PrintWallet = { address: string; name: string; qrUrl: string };

type Box = { x: number; y: number; width: number; height: number };

/**
 * A card lays out differently with no name (a write-in line), one line of name
 * or two, so each is a background of its own.
 */
type Layout = "write-in" | 1 | 2;

type Background = { jpeg: Uint8Array<ArrayBuffer>; name: Box | null; address: Box };

const LAYOUT_SAMPLE_NAMES = { 1: "M", 2: "M ".repeat(80).trim() } as const;
const SAMPLE_ADDRESS = `0x${"0".repeat(40)}`;
/** Room past the address's line box for its glyphs; the band around it is blank. */
const ADDRESS_BLEED = 4;
const JPEG_QUALITY = 0.9;
const ELLIPSIS = "…";

/**
 * Rasterises the batch's card design once per layout and lays the cards out on
 * A4 sheets with crop marks.
 *
 * Every card in a batch is the same but for its name, address and QR. The
 * design is therefore rasterised with html-to-image once per `Layout` — at most
 * three times, whatever the batch size — and embedded in the PDF once. Each
 * wallet's name and address are drawn with Canvas 2D into small strips laid
 * over it, and the QR is drawn as vectors from the module matrix.
 *
 * Rasterising the whole card per wallet, as this used to, built a multi-megabyte
 * SVG per card (every font subset and the logo inlined as base64) and decoded
 * it again, which on a 500-card batch ran the tab out of memory.
 */
export async function renderPaperWalletSheet(
  wallets: readonly PrintWallet[],
  design: PaperWalletCardDesign,
  options: {
    hairlines: boolean;
    onProgress?: (done: number) => void;
    onAssembling?: () => void;
  },
): Promise<Blob> {
  const context = document.createElement("canvas").getContext("2d");
  if (!context) throw new Error("This browser cannot draw the paper wallet sheet");

  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  Object.assign(host.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    pointerEvents: "none",
  });
  document.body.appendChild(host);
  const root = createRoot(host);
  let mounted = true;
  const removeCard = () => {
    if (!mounted) return;
    mounted = false;
    root.unmount();
    host.remove();
  };

  const backgrounds = new Map<Layout, Background>();
  const nameJpegs = new Map<string, Uint8Array<ArrayBuffer>>();
  let fontEmbedCSS: string | undefined;
  let lastProgressAt = Number.NEGATIVE_INFINITY;

  async function backgroundFor(layout: Layout): Promise<Background> {
    const cached = backgrounds.get(layout);
    if (cached) return cached;

    flushSync(() => {
      root.render(
        <PaperWalletCard
          address={SAMPLE_ADDRESS}
          name={layout === "write-in" ? "" : LAYOUT_SAMPLE_NAMES[layout]}
          design={design}
          blankText
        />,
      );
    });
    const card = host.firstElementChild;
    if (!(card instanceof HTMLElement)) throw new Error("Paper wallet card did not render");
    await Promise.all(
      Array.from(card.querySelectorAll("img"), (img) => img.decode().catch(() => undefined)),
    );
    // Only the design's own text is painted into the background; the wallet
    // text is drawn from the document's fonts, which are already loaded.
    fontEmbedCSS ??= await embedCardFonts(
      `${design.website}${design.description}Name${SAMPLE_ADDRESS}M`,
    );

    const origin = card.getBoundingClientRect();
    const boxOf = (slot: string): Box => {
      const rect = card.querySelector(`[data-slot="${slot}"]`)?.getBoundingClientRect();
      if (!rect) throw new Error(`Paper wallet card has no ${slot}`);
      return {
        x: rect.left - origin.left,
        y: rect.top - origin.top,
        width: rect.width,
        height: rect.height,
      };
    };
    const addressLine = boxOf("address");
    const background: Background = {
      jpeg: dataUrlBytes(
        await toJpeg(card, {
          pixelRatio: PAPER_WALLET_PIXEL_RATIO,
          width: PAPER_WALLET_CARD_WIDTH,
          height: PAPER_WALLET_CARD_HEIGHT,
          backgroundColor: "#ffffff",
          quality: JPEG_QUALITY,
          fontEmbedCSS,
        }),
      ),
      name: layout === "write-in" ? null : boxOf("name"),
      address: {
        ...addressLine,
        y: addressLine.y - ADDRESS_BLEED,
        height: addressLine.height + 2 * ADDRESS_BLEED,
      },
    };
    backgrounds.set(layout, background);
    return background;
  }

  try {
    await Promise.all([
      document.fonts.load(
        canvasFont(PAPER_WALLET_NAME_TEXT),
        wallets.map((wallet) => wallet.name).join(""),
      ),
      document.fonts.load(canvasFont(PAPER_WALLET_ADDRESS_TEXT), SAMPLE_ADDRESS),
    ]);

    const cards: PreparedCard[] = [];
    for (const [index, wallet] of wallets.entries()) {
      const lines = clampLines(
        wallet.name,
        PAPER_WALLET_NAME_TEXT,
        PAPER_WALLET_NAME_WIDTH,
        PAPER_WALLET_NAME_LINES,
      );
      const layout: Layout = lines.length === 0 ? "write-in" : lines.length === 1 ? 1 : 2;
      const background = await backgroundFor(layout);

      const overlays: CardOverlay[] = [];
      if (background.name) {
        const key = JSON.stringify([layout, lines]);
        let jpeg = nameJpegs.get(key);
        if (!jpeg) {
          jpeg = await rasterizeText(context, background.name, lines, PAPER_WALLET_NAME_TEXT, {
            align: "left",
            top: 0,
          });
          nameJpegs.set(key, jpeg);
        }
        overlays.push({
          ...background.name,
          jpeg,
        });
      }
      overlays.push({
        ...background.address,
        jpeg: await rasterizeText(
          context,
          background.address,
          [wallet.address],
          PAPER_WALLET_ADDRESS_TEXT,
          { align: "center", top: ADDRESS_BLEED },
        ),
      });
      cards.push({ jpeg: background.jpeg, overlays, qrUrl: wallet.qrUrl });
      const now = performance.now();
      if (index + 1 === wallets.length || now - lastProgressAt >= 100) {
        options.onProgress?.(index + 1);
        lastProgressAt = now;
      }
    }

    options.onAssembling?.();
    removeCard();
    return await assemblePaperWalletPdfInWorker(cards, options.hairlines);
  } finally {
    removeCard();
  }
}

/**
 * The name's lines as the card's `-webkit-line-clamp` shows them: wrapped the
 * way CSS wraps (Pretext implements its line breaking over canvas measurement,
 * graphemes and all scripts included), and past the last line, that line ends
 * in an ellipsis. Blank text is no lines — a write-in card.
 */
export function clampLines(
  text: string,
  style: CardTextStyle,
  maxWidth: number,
  maxLines: number,
): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const font = canvasFont(style);
  const options = { letterSpacing: style.letterSpacingEm * style.size };
  const { lines } = layoutWithLines(
    prepareWithSegments(trimmed, font, options),
    maxWidth,
    style.size * style.lineHeight,
  );
  if (lines.length <= maxLines) return lines.map((line) => line.text.trimEnd());

  const graphemes = Array.from(
    new Intl.Segmenter().segment(lines[maxLines - 1]?.text ?? ""),
    ({ segment }) => segment,
  );
  const ellipsized = () => `${graphemes.join("").trimEnd()}${ELLIPSIS}`;
  while (
    graphemes.length > 0 &&
    measureNaturalWidth(prepareWithSegments(ellipsized(), font, options)) > maxWidth
  ) {
    graphemes.pop();
  }
  return [...lines.slice(0, maxLines - 1).map((line) => line.text.trimEnd()), ellipsized()];
}

function canvasFont(text: CardTextStyle): string {
  return `${text.weight} ${text.size}px ${text.family}`;
}

function setFont(context: CanvasRenderingContext2D, text: CardTextStyle): void {
  context.font = canvasFont(text);
  context.letterSpacing = `${text.letterSpacingEm * text.size}px`;
}

/** Draws `lines` as the card would into a white strip the size of `box`, as JPEG. */
async function rasterizeText(
  context: CanvasRenderingContext2D,
  box: Box,
  lines: readonly string[],
  text: CardTextStyle,
  { align, top }: { align: "left" | "center"; top: number },
): Promise<Uint8Array<ArrayBuffer>> {
  const { canvas } = context;
  // Resizing resets the context, so every piece of state is set after it.
  canvas.width = Math.ceil(box.width * PAPER_WALLET_PIXEL_RATIO);
  canvas.height = Math.ceil(box.height * PAPER_WALLET_PIXEL_RATIO);
  context.setTransform(PAPER_WALLET_PIXEL_RATIO, 0, 0, PAPER_WALLET_PIXEL_RATIO, 0, 0);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, box.width, box.height);
  setFont(context, text);
  context.fillStyle = PAPER_WALLET_INK;
  context.textAlign = align;
  context.textBaseline = "alphabetic";

  const lineHeight = text.size * text.lineHeight;
  for (const [index, line] of lines.entries()) {
    const metrics = context.measureText(line);
    // CSS centres the font's ascent plus descent in the line box.
    const glyphs = metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent;
    const baseline =
      top + index * lineHeight + (lineHeight - glyphs) / 2 + metrics.fontBoundingBoxAscent;
    context.fillText(line, align === "center" ? box.width / 2 : 0, baseline);
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error("Card text could not be drawn"))),
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
  return new Uint8Array(await blob.arrayBuffer());
}
