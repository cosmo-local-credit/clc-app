import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const { mockToPng, mockToCanvas } = vi.hoisted(() => ({
  mockToPng: vi.fn().mockResolvedValue("data:image/png;base64,base"),
  mockToCanvas: vi.fn().mockImplementation(async (canvas: HTMLCanvasElement) => {
    canvas.width = 456;
    canvas.height = 456;
  }),
}));

vi.mock("html-to-image", () => ({ toPng: mockToPng }));
vi.mock("qrcode", () => ({ default: { toCanvas: mockToCanvas } }));

import { exportPaperWallet } from "./paper-wallet-export";

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
