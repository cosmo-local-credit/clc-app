/**
 * A minimal PDF 1.4 writer for print sheets: JPEG images, filled rectangles and
 * stroked lines at exact physical positions, and nothing else.
 *
 * It exists so a printable sheet keeps its millimetre geometry. A browser print
 * of an HTML page is subject to "fit to page" and margin settings the author
 * cannot control; a PDF page with an explicit MediaBox is not. There are no
 * fonts, so text has to arrive already rasterised inside an image.
 *
 * Coordinates are millimetres from the page's top-left corner, the way a layout
 * is usually described. The writer flips them into PDF's bottom-left user space.
 */

type PdfColor = readonly [r: number, g: number, b: number];

type PdfImage = {
  /**
   * Baseline or progressive JPEG bytes. Grayscale and RGB are supported.
   *
   * Images are embedded once per distinct array, so placing the same array on
   * many pages — a background shared by every card — costs its bytes once.
   */
  jpeg: Uint8Array<ArrayBuffer>;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PdfRect = { x: number; y: number; width: number; height: number };

export type PdfLine = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Stroke width in millimetres. */
  width: number;
  color: PdfColor;
};

type PdfPage = {
  images?: readonly PdfImage[];
  /** Filled rectangles, drawn after the images in `rectColor`. */
  rects?: readonly PdfRect[];
  rectColor?: PdfColor;
  /** Drawn last, over everything else. */
  lines?: readonly PdfLine[];
};

export type PdfDocument = {
  widthMm: number;
  heightMm: number;
  pages: readonly PdfPage[];
  title?: string;
};

const PT_PER_MM = 72 / 25.4;

export type JpegInfo = { width: number; height: number; components: number };

/**
 * Reads the frame header of a JPEG. PDF needs the pixel size and colour space
 * of an embedded DCT image, and the file is the only place they are recorded.
 */
export function readJpegInfo(bytes: Uint8Array): JpegInfo {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error("Not a JPEG image");
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) throw new Error("Malformed JPEG image");
    const marker = bytes[offset + 1] ?? 0;
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    const length = ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0);
    // SOF0-SOF15 carry the frame size, except DHT (C4), JPG (C8) and DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const height = ((bytes[offset + 5] ?? 0) << 8) | (bytes[offset + 6] ?? 0);
      const width = ((bytes[offset + 7] ?? 0) << 8) | (bytes[offset + 8] ?? 0);
      const components = bytes[offset + 9] ?? 0;
      if (components !== 1 && components !== 3) {
        throw new Error(`Unsupported JPEG colour components: ${components}`);
      }
      return { width, height, components };
    }
    offset += 2 + length;
  }
  throw new Error("JPEG image has no frame header");
}

function num(value: number): string {
  const fixed = value.toFixed(3);
  return fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
}

function colorOp(color: PdfColor, op: "rg" | "RG"): string {
  return `${num(color[0])} ${num(color[1])} ${num(color[2])} ${op}`;
}

/** PDF string literal; only the characters with syntactic meaning need escaping. */
function pdfString(value: string): string {
  return `(${value.replace(/[\\()]/g, (char) => `\\${char}`).replace(/[^\x20-\x7e]/g, "?")})`;
}

/**
 * The file as a list of chunks, in order. A caller passes them straight to
 * `new Blob(chunks)`; joining them first would hold a second copy of every
 * image at the moment memory peaks.
 */
export function createPdf(document: PdfDocument): Uint8Array<ArrayBuffer>[] {
  if (document.pages.length === 0) throw new Error("A PDF needs at least one page");

  const encoder = new TextEncoder();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  const offsets: number[] = [];
  let length = 0;

  const write = (chunk: string | Uint8Array<ArrayBuffer>) => {
    const bytes = typeof chunk === "string" ? encoder.encode(chunk) : chunk;
    chunks.push(bytes);
    length += bytes.length;
  };

  // Object numbers are fixed up front so pages can reference their children.
  const pageW = document.widthMm * PT_PER_MM;
  const pageH = document.heightMm * PT_PER_MM;
  let nextObject = 4; // 1 catalog, 2 page tree, 3 info
  const imageObjects = new Map<Uint8Array<ArrayBuffer>, number>();
  const plan = document.pages.map((page) => {
    const pageObject = nextObject++;
    const contentObject = nextObject++;
    const pageImages = (page.images ?? []).map((image) => {
      let id = imageObjects.get(image.jpeg);
      if (id === undefined) {
        id = nextObject++;
        imageObjects.set(image.jpeg, id);
      }
      return id;
    });
    return { page, pageObject, contentObject, pageImages };
  });

  const beginObject = (id: number) => {
    offsets[id] = length;
    write(`${id} 0 obj\n`);
  };

  // The binary comment marks the file as binary for transfer tools.
  write("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n");

  beginObject(1);
  write("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

  beginObject(2);
  const kids = plan.map((entry) => `${entry.pageObject} 0 R`).join(" ");
  write(`<< /Type /Pages /Kids [${kids}] /Count ${plan.length} >>\nendobj\n`);

  beginObject(3);
  const title = document.title ? ` /Title ${pdfString(document.title)}` : "";
  write(`<< /Producer (CLC)${title} >>\nendobj\n`);

  for (const { page, pageObject, contentObject, pageImages } of plan) {
    const xObjects = Array.from(new Set(pageImages), (id) => `/Im${id} ${id} 0 R`).join(" ");
    beginObject(pageObject);
    write(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(pageW)} ${num(pageH)}]` +
        ` /Resources << /XObject << ${xObjects} >> >> /Contents ${contentObject} 0 R >>\nendobj\n`,
    );

    const ops: string[] = [];
    (page.images ?? []).forEach((image, index) => {
      const w = image.width * PT_PER_MM;
      const h = image.height * PT_PER_MM;
      const x = image.x * PT_PER_MM;
      const y = pageH - image.y * PT_PER_MM - h;
      ops.push(`q ${num(w)} 0 0 ${num(h)} ${num(x)} ${num(y)} cm /Im${pageImages[index]} Do Q`);
    });
    if (page.rects?.length) {
      ops.push(colorOp(page.rectColor ?? [0, 0, 0], "rg"));
      for (const rect of page.rects) {
        const h = rect.height * PT_PER_MM;
        ops.push(
          `${num(rect.x * PT_PER_MM)} ${num(pageH - rect.y * PT_PER_MM - h)} ${num(rect.width * PT_PER_MM)} ${num(h)} re`,
        );
      }
      ops.push("f");
    }
    for (const line of page.lines ?? []) {
      ops.push(
        `${colorOp(line.color, "RG")} ${num(line.width * PT_PER_MM)} w` +
          ` ${num(line.x1 * PT_PER_MM)} ${num(pageH - line.y1 * PT_PER_MM)} m` +
          ` ${num(line.x2 * PT_PER_MM)} ${num(pageH - line.y2 * PT_PER_MM)} l S`,
      );
    }
    const content = encoder.encode(ops.join("\n"));
    beginObject(contentObject);
    write(`<< /Length ${content.length} >>\nstream\n`);
    write(content);
    write("\nendstream\nendobj\n");
  }

  for (const [jpeg, id] of imageObjects) {
    const info = readJpegInfo(jpeg);
    const colorSpace = info.components === 1 ? "/DeviceGray" : "/DeviceRGB";
    beginObject(id);
    write(
      `<< /Type /XObject /Subtype /Image /Width ${info.width} /Height ${info.height}` +
        ` /ColorSpace ${colorSpace} /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
    );
    write(jpeg);
    write("\nendstream\nendobj\n");
  }

  const xrefOffset = length;
  const objectCount = nextObject;
  let xref = `xref\n0 ${objectCount}\n0000000000 65535 f \n`;
  for (let id = 1; id < objectCount; id++) {
    xref += `${String(offsets[id] ?? 0).padStart(10, "0")} 00000 n \n`;
  }
  write(xref);
  write(
    `trailer\n<< /Size ${objectCount} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  );

  return chunks;
}
