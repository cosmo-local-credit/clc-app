import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const { mockToPng, mockToJpeg, mockToCanvas } = vi.hoisted(() => ({
  mockToPng: vi.fn().mockResolvedValue("data:image/png;base64,base"),
  // SOI, an SOF0 frame header for a 1 x 1 RGB image, EOI.
  mockToJpeg: vi.fn().mockResolvedValue("data:image/jpeg;base64,/9j/wAARCAABAAEDAREAAhEBAxEB/9k="),
  mockToCanvas: vi.fn().mockImplementation(async (canvas: HTMLCanvasElement) => {
    canvas.width = 456;
    canvas.height = 456;
  }),
}));

vi.mock("html-to-image", () => ({ toPng: mockToPng, toJpeg: mockToJpeg }));
vi.mock("qrcode", () => ({
  default: {
    toCanvas: mockToCanvas,
    create: () => ({ modules: { size: 2, data: new Uint8Array([1, 0, 0, 1]) } }),
  },
}));

import { exportPaperWallet, exportPaperWalletSheet } from "./paper-wallet-export";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  mockToPng.mockClear();
  mockToCanvas.mockClear();
});

describe("exportPaperWallet", () => {
  it("draws a separately rendered QR onto the final PNG", async () => {
    const drawImage = vi.fn();
    vi.stubGlobal(
      "Image",
      class {
        src = "";
        naturalWidth = 1200;
        naturalHeight = 756;
        decode = vi.fn().mockResolvedValue(undefined);
      },
    );
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage,
      imageSmoothingEnabled: true,
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => {
      callback(new Blob(["png"], { type: "image/png" }));
    });

    const card = document.createElement("div");
    const qrUrl = "https://cosmolocal.credit/?w=encrypted-key";
    const blob = await exportPaperWallet(card, qrUrl);

    expect(blob.type).toBe("image/png");
    expect(mockToPng).toHaveBeenCalledWith(
      card,
      expect.objectContaining({ pixelRatio: 2, width: 600, height: 378 }),
    );
    expect(mockToCanvas).toHaveBeenCalledWith(
      expect.any(HTMLCanvasElement),
      qrUrl,
      expect.objectContaining({ width: 456, margin: 0 }),
    );
    const qrCanvas = mockToCanvas.mock.calls[0]?.[0];
    expect(drawImage).toHaveBeenLastCalledWith(qrCanvas, 680, 64, 456, 456);
  });

  it("refuses to export when the QR cannot be rendered", async () => {
    vi.stubGlobal(
      "Image",
      class {
        src = "";
        naturalWidth = 1200;
        naturalHeight = 756;
        decode = vi.fn().mockResolvedValue(undefined);
      },
    );
    mockToCanvas.mockRejectedValueOnce(new Error("QR failed"));
    await expect(exportPaperWallet(document.createElement("div"), "wallet-url")).rejects.toThrow(
      "QR failed",
    );
  });
});

describe("exportPaperWalletSheet", () => {
  it("renders the card without its QR into an A4 PDF", async () => {
    const card = document.createElement("div");
    const blob = await exportPaperWalletSheet(card, "https://cosmolocal.credit/?w=key");

    expect(blob.type).toBe("application/pdf");
    expect(mockToJpeg).toHaveBeenCalledWith(
      card,
      expect.objectContaining({ width: 600, height: 378, style: expect.any(Object) }),
    );
    const filter = mockToJpeg.mock.calls[0]?.[1]?.filter as (node: Node) => boolean;
    const qr = document.createElement("img");
    qr.setAttribute("data-slot", "qr");
    expect(filter(qr)).toBe(false);

    const body = new TextDecoder("latin1").decode(await blob.arrayBuffer());
    expect(body.startsWith("%PDF-1.4")).toBe(true);
    expect(body).toContain("/MediaBox [0 0 595.276 841.89]");
    expect(body).toContain("/Width 1 /Height 1");
  });
});
