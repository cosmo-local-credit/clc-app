import { assemblePaperWalletPdf, type PreparedCard } from "./pdf-assembly";

export type { PreparedCard } from "./pdf-assembly";

type WorkerReply = { ok: true; pdf: Blob } | { ok: false; error: string };

export function assemblePaperWalletPdfInWorker(
  cards: readonly PreparedCard[],
  hairlines: boolean,
): Promise<Blob> {
  // Tests and older browsers have no Worker; modern Firefox takes the worker path.
  if (typeof Worker === "undefined") {
    return Promise.resolve().then(() => assemblePaperWalletPdf(cards, hairlines));
  }

  return new Promise<Blob>((resolve, reject) => {
    const worker = new Worker(new URL("./pdf.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      worker.terminate();
      if (event.data.ok) resolve(event.data.pdf);
      else reject(new Error(event.data.error));
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || "The PDF worker failed"));
    };
    // Each shared background/name array is transferred once. This moves the
    // JPEG bytes off the page without briefly keeping a second copy there.
    const buffers = new Set<ArrayBuffer>();
    for (const card of cards) {
      buffers.add(card.jpeg.buffer);
      for (const overlay of card.overlays) buffers.add(overlay.jpeg.buffer);
    }
    try {
      worker.postMessage({ cards, hairlines }, [...buffers]);
    } catch (error) {
      worker.terminate();
      reject(error);
    }
  });
}
