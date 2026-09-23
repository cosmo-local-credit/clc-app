import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { assemblePaperWalletPdfInWorker, type PreparedCard } from "./assemble-pdf";

describe("assemblePaperWalletPdfInWorker", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("moves each distinct JPEG buffer to a worker once", async () => {
    const background = new Uint8Array([1]);
    const name = new Uint8Array([2]);
    const cards: PreparedCard[] = [0, 1].map((index) => ({
      jpeg: background,
      overlays: [
        { jpeg: name, x: 0, y: 0, width: 10, height: 10 },
        { jpeg: new Uint8Array([index + 3]), x: 0, y: 0, width: 10, height: 10 },
      ],
      qrUrl: `https://example.test/?w=${index}`,
    }));
    const pdf = new Blob(["%PDF-1.4"], { type: "application/pdf" });
    class FakeWorker {
      static instances: FakeWorker[] = [];
      onmessage: ((event: MessageEvent<{ ok: true; pdf: Blob }>) => void) | null = null;
      onerror = null;
      postMessage = vi.fn();
      terminate = vi.fn();

      constructor() {
        FakeWorker.instances.push(this);
      }
    }
    vi.stubGlobal("Worker", FakeWorker);

    const pending = assemblePaperWalletPdfInWorker(cards, true);
    const worker = FakeWorker.instances[0] as FakeWorker;
    expect(worker.postMessage).toHaveBeenCalledWith({ cards, hairlines: true }, [
      background.buffer,
      name.buffer,
      cards[0]?.overlays[1]?.jpeg.buffer,
      cards[1]?.overlays[1]?.jpeg.buffer,
    ]);

    worker.onmessage?.(new MessageEvent("message", { data: { ok: true, pdf } }));
    await expect(pending).resolves.toBe(pdf);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
});
