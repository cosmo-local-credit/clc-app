import { toPng } from "html-to-image";
import QRCode from "qrcode";
import {
  PAPER_WALLET_EXPORT_PIXEL_RATIO,
  PAPER_WALLET_HEIGHT,
  PAPER_WALLET_WIDTH,
} from "./paper-wallet-constants";

// The QR's white inner square in the fixed 600 × 378 card. Keep these aligned
// with the card's 20px padding, 1px border and 250px QR frame with 10px padding.
const QR_X = 340;
const QR_Y = 32;
const QR_SIZE = 228;

/** Render the QR independently so Safari cannot omit it from the SVG snapshot. */
export async function exportPaperWallet(card: HTMLDivElement, qrUrl: string): Promise<Blob> {
  const pixelRatio = PAPER_WALLET_EXPORT_PIXEL_RATIO;
  const baseUrl = await toPng(card, {
    pixelRatio,
    width: PAPER_WALLET_WIDTH,
    height: PAPER_WALLET_HEIGHT,
    backgroundColor: "#ffffff",
    filter: (node) => !(node instanceof Element && node.getAttribute("data-slot") === "qr"),
  });

  const baseImage = new Image();
  baseImage.src = baseUrl;
  await baseImage.decode();
  if (!baseImage.naturalWidth || !baseImage.naturalHeight) {
    throw new Error("Paper wallet image could not be decoded");
  }

  const qrCanvas = document.createElement("canvas");
  await QRCode.toCanvas(qrCanvas, qrUrl, {
    margin: 0,
    width: QR_SIZE * pixelRatio,
    color: { dark: "#000000", light: "#ffffff" },
  });
  if (qrCanvas.width === 0 || qrCanvas.height === 0) {
    throw new Error("Paper wallet QR code could not be rendered");
  }

  const canvas = document.createElement("canvas");
  canvas.width = PAPER_WALLET_WIDTH * pixelRatio;
  canvas.height = PAPER_WALLET_HEIGHT * pixelRatio;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Paper wallet image could not be rendered");
  context.drawImage(baseImage, 0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = false;
  context.drawImage(
    qrCanvas,
    QR_X * pixelRatio,
    QR_Y * pixelRatio,
    QR_SIZE * pixelRatio,
    QR_SIZE * pixelRatio,
  );

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Paper wallet PNG could not be created"));
    }, "image/png");
  });
}
