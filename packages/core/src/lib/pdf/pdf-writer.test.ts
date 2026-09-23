import { describe, expect, it } from "vite-plus/test";
import { createPdf, readJpegInfo } from "./pdf-writer";

/** SOI, an APP0 segment, then an SOF0 frame header for a 3 x 2 RGB image. */
const JPEG = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x02, 0x00,
  0x03, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9,
]);

function text(bytes: Uint8Array): string {
  return new TextDecoder("latin1").decode(bytes);
}

describe("readJpegInfo", () => {
  it("reads the frame size and components past other segments", () => {
    expect(readJpegInfo(JPEG)).toEqual({ width: 3, height: 2, components: 3 });
  });

  it("rejects bytes that are not a JPEG", () => {
    expect(() => readJpegInfo(new Uint8Array([0x89, 0x50]))).toThrow("Not a JPEG");
  });
});

describe("createPdf", () => {
  const pdf = createPdf({
    widthMm: 210,
    heightMm: 297,
    title: "Sheet (1)",
    pages: [
      {
        images: [{ jpeg: JPEG, x: 10, y: 10, width: 85.6, height: 53.98 }],
        rects: [{ x: 0, y: 0, width: 1, height: 1 }],
        lines: [{ x1: 0, y1: 0, x2: 10, y2: 0, width: 0.2, color: [0, 0, 0] }],
      },
      {},
    ],
  });
  const body = text(pdf);

  it("writes an A4 page tree with every page", () => {
    expect(body.startsWith("%PDF-1.4")).toBe(true);
    expect(body).toContain("/Count 2");
    expect(body).toContain("/MediaBox [0 0 595.276 841.89]");
    expect(body).toContain("/Title (Sheet \\(1\\))");
    expect(body.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("embeds the JPEG as a DCT image at its pixel size", () => {
    expect(body).toContain("/Width 3 /Height 2 /ColorSpace /DeviceRGB");
    expect(body).toContain(`/Filter /DCTDecode /Length ${JPEG.length}`);
  });

  it("places content in PDF space, flipped from the top-left", () => {
    // 10 mm from the top of a 297 mm page, 53.98 mm tall.
    expect(body).toContain("242.646 0 0 153.014 28.346 660.529 cm /Im0 Do");
  });

  it("points every xref entry at its object", () => {
    const xrefAt = Number(body.match(/startxref\n(\d+)/)?.[1]);
    const entries = body.slice(xrefAt).match(/^(\d{10}) 00000 n $/gm) ?? [];
    expect(entries.length).toBeGreaterThan(0);
    entries.forEach((entry, index) => {
      const offset = Number(entry.slice(0, 10));
      expect(body.slice(offset, offset + 12)).toMatch(new RegExp(`^${index + 1} 0 obj`));
    });
  });
});
