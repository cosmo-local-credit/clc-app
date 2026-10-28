import { describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  buildPdf: vi.fn(() => new Uint8Array([1, 2, 3])),
}));

vi.mock("@clc/core/features/wallet/paper-wallet-sheet", () => ({
  buildPaperWalletSheetPdf: mocks.buildPdf,
}));

vi.mock("qrcode", () => ({
  default: { create: () => ({ modules: { size: 1, data: new Uint8Array([1]) } }) },
}));

import { assemblePaperWalletPdf } from "./pdf-assembly";

describe("assemblePaperWalletPdf", () => {
  it("uses the sign-in card title in exported PDFs", () => {
    const pdf = assemblePaperWalletPdf(
      [{ jpeg: new Uint8Array([1]), overlays: [], qrUrl: "https://example.test/?w=key" }],
      true,
    );

    expect(pdf.type).toBe("application/pdf");
    expect(mocks.buildPdf).toHaveBeenCalledWith(expect.any(Array), {
      hairlines: true,
      title: "CLC sign-in cards",
    });
  });
});
