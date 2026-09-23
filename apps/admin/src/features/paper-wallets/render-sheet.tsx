import { dataUrlBytes } from "@clc/core/lib/data-url";
import {
  buildPaperWalletSheetPdf,
  PAPER_WALLET_CARD_HEIGHT,
  PAPER_WALLET_CARD_WIDTH,
  type PrintableCard,
} from "@clc/core/features/wallet/paper-wallet-sheet";
import { getFontEmbedCSS, toJpeg } from "html-to-image";
import QRCode from "qrcode";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import { PaperWalletCard, type PaperWalletCardDesign } from "./ui/paper-wallet-card";

export type PrintWallet = { address: string; name: string; qrUrl: string };

/** 2x the design size is ~356 dpi at CR80, above what office printers resolve. */
const PIXEL_RATIO = 2;

/**
 * Rasterises every card and lays them out on A4 sheets with crop marks.
 *
 * One card element is mounted offscreen and re-rendered per wallet, so a batch
 * of hundreds never has hundreds of nodes in the document. The font CSS is
 * resolved once and reused: html-to-image would otherwise refetch and inline
 * every web font for each card. The QR is not rasterised — the PDF draws it as
 * vectors from the module matrix.
 */
export async function renderPaperWalletSheet(
  wallets: readonly PrintWallet[],
  design: PaperWalletCardDesign,
  options: { hairlines: boolean; onProgress?: (done: number) => void },
): Promise<Blob> {
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

  try {
    const cards: PrintableCard[] = [];
    let fontEmbedCSS: string | undefined;

    for (const [index, wallet] of wallets.entries()) {
      flushSync(() => {
        root.render(
          <PaperWalletCard address={wallet.address} name={wallet.name} design={design} />,
        );
      });
      const card = host.firstElementChild;
      if (!(card instanceof HTMLElement)) throw new Error("Paper wallet card did not render");
      if (index === 0) {
        await Promise.all(
          Array.from(card.querySelectorAll("img"), (img) => img.decode().catch(() => undefined)),
        );
        fontEmbedCSS = await getFontEmbedCSS(card);
      }

      const jpegUrl = await toJpeg(card, {
        pixelRatio: PIXEL_RATIO,
        width: PAPER_WALLET_CARD_WIDTH,
        height: PAPER_WALLET_CARD_HEIGHT,
        backgroundColor: "#ffffff",
        quality: 0.9,
        fontEmbedCSS,
      });
      cards.push({ jpeg: dataUrlBytes(jpegUrl), qr: QRCode.create(wallet.qrUrl).modules });
      options.onProgress?.(index + 1);
    }

    const pdf = buildPaperWalletSheetPdf(cards, {
      hairlines: options.hairlines,
      title: "CLC paper wallets",
    });
    return new Blob([pdf], { type: "application/pdf" });
  } finally {
    root.unmount();
    host.remove();
  }
}
