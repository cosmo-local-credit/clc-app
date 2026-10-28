import {
  buildPaperWalletSheetPdf,
  type CardOverlay,
  type PrintableCard,
} from "@clc/core/features/wallet/paper-wallet-sheet";
import QRCode from "qrcode";

export type PreparedCard = {
  jpeg: Uint8Array<ArrayBuffer>;
  overlays: readonly CardOverlay[];
  qrUrl: string;
};

/** Pure PDF work; the browser runs this in a worker after the card text is drawn. */
export function assemblePaperWalletPdf(cards: readonly PreparedCard[], hairlines: boolean): Blob {
  const printable: PrintableCard[] = cards.map(({ qrUrl, ...card }) => ({
    ...card,
    qr: QRCode.create(qrUrl).modules,
  }));
  return new Blob(buildPaperWalletSheetPdf(printable, { hairlines, title: "CLC sign-in cards" }), {
    type: "application/pdf",
  });
}
