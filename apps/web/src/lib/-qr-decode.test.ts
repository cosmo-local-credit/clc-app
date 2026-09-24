import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Canvas, createCanvas, loadImage } from "canvas";
import type * as ZXingReader from "zxing-wasm/reader";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createQrFrameReader, decodeQrImageFile } from "#/lib/qr-decode";

// The real binary, handed over directly: tests have no server to fetch it from.
vi.mock("zxing-wasm/reader", async (importOriginal) => {
  const actual = await importOriginal<typeof ZXingReader>();
  const wasm = readFileSync(
    createRequire(import.meta.url).resolve("zxing-wasm/reader/zxing_reader.wasm"),
  );
  const wasmBinary = wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength);
  return {
    ...actual,
    prepareZXingModule: () => actual.prepareZXingModule({ overrides: { wasmBinary } }),
  };
});

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "-fixtures/qr");

/**
 * Real images and the payload each must decode to, `null` for images with no
 * QR code. Includes the reported paper wallet screenshot and every image in
 * the set that html5-qrcode's zxing-js decoder missed.
 */
const EXPECTED: Record<string, string | null> = JSON.parse(
  readFileSync(join(FIXTURES, "expected.json"), "utf8"),
);

function fixture(name: string) {
  return new File([readFileSync(join(FIXTURES, name))], name);
}

async function fixtureAsVideo(name: string) {
  const image = await loadImage(readFileSync(join(FIXTURES, name)));
  return Object.assign(image, {
    videoWidth: image.width,
    videoHeight: image.height,
  }) as unknown as HTMLVideoElement;
}

class NativeDetectorStub {
  static formats = ["qr_code"];
  static detect = vi.fn<(source: unknown) => Promise<Array<{ rawValue: string }>>>();
  static getSupportedFormats = vi.fn(async () => NativeDetectorStub.formats);
  detect(source: unknown) {
    return NativeDetectorStub.detect(source);
  }
}

beforeEach(() => {
  // jsdom rasterises nothing, so both halves of the browser's image pipeline
  // are node-canvas here: decoding the file, and drawing it to read pixels.
  vi.stubGlobal("createImageBitmap", async (file: Blob) =>
    Object.assign(await loadImage(Buffer.from(await file.arrayBuffer())), { close() {} }),
  );
  const createElement = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation(((tagName: string) =>
    tagName === "canvas"
      ? createCanvas(1, 1)
      : createElement(tagName)) as typeof document.createElement);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  NativeDetectorStub.formats = ["qr_code"];
  NativeDetectorStub.detect.mockReset();
});

describe("decodeQrImageFile", () => {
  it("covers every fixture on disk", () => {
    const images = readdirSync(FIXTURES).filter((name) => name !== "expected.json");
    expect(images.sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it.each(Object.entries(EXPECTED))("reads %s", async (name, payload) => {
    await expect(decodeQrImageFile(fixture(name))).resolves.toBe(payload);
  });

  it("rejects a file that is not an image", async () => {
    await expect(decodeQrImageFile(new File(["not an image"], "note.png"))).rejects.toThrow();
  });

  it("asks the native detector when zxing finds nothing", async () => {
    vi.stubGlobal("BarcodeDetector", NativeDetectorStub);
    NativeDetectorStub.detect.mockResolvedValue([{ rawValue: "0xnative" }]);

    await expect(decodeQrImageFile(fixture("none-qr-removed.jpg"))).resolves.toBe("0xnative");
  });

  it("does not ask the native detector when zxing reads the code", async () => {
    vi.stubGlobal("BarcodeDetector", NativeDetectorStub);

    await expect(decodeQrImageFile(fixture("paper-wallet-1280.jpeg"))).resolves.toBe(
      EXPECTED["paper-wallet-1280.jpeg"],
    );
    expect(NativeDetectorStub.detect).not.toHaveBeenCalled();
  });

  it("resolves null when the native detector fails too", async () => {
    vi.stubGlobal("BarcodeDetector", NativeDetectorStub);
    NativeDetectorStub.detect.mockRejectedValue(new Error("service unavailable"));

    await expect(decodeQrImageFile(fixture("none-qr-removed.jpg"))).resolves.toBeNull();
  });
});

describe("createQrFrameReader", () => {
  it("reads a frame with zxing when there is no native detector", async () => {
    const read = createQrFrameReader();

    await expect(read(await fixtureAsVideo("paper-wallet-1280.jpeg"))).resolves.toBe(
      EXPECTED["paper-wallet-1280.jpeg"],
    );
  });

  it("reads a frame larger than it decodes at", async () => {
    const drawn: Canvas[] = [];
    const createElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(((tagName: string) => {
      if (tagName !== "canvas") return createElement(tagName);
      const canvas = createCanvas(1, 1);
      drawn.push(canvas);
      return canvas;
    }) as typeof document.createElement);

    const read = createQrFrameReader();
    await expect(read(await fixtureAsVideo("photo-4032-small-card.jpg"))).resolves.toBe(
      EXPECTED["photo-4032-small-card.jpg"],
    );
    expect(Math.max(drawn[0].width, drawn[0].height)).toBe(1280);
  });

  it("returns null before the video has a frame", async () => {
    const read = createQrFrameReader();
    const video = { videoWidth: 0, videoHeight: 0 } as HTMLVideoElement;

    await expect(read(video)).resolves.toBeNull();
  });

  it("uses the native detector when it reads QR codes", async () => {
    vi.stubGlobal("BarcodeDetector", NativeDetectorStub);
    NativeDetectorStub.detect.mockResolvedValue([{ rawValue: "0xnative" }]);
    const video = await fixtureAsVideo("none-qr-removed.jpg");
    const read = createQrFrameReader();

    await expect(read(video)).resolves.toBe("0xnative");
    expect(NativeDetectorStub.detect).toHaveBeenCalledWith(video);
  });

  it("ignores a native detector without QR support", async () => {
    vi.stubGlobal("BarcodeDetector", NativeDetectorStub);
    NativeDetectorStub.formats = ["ean_13"];
    const read = createQrFrameReader();

    await expect(read(await fixtureAsVideo("paper-wallet-1280.jpeg"))).resolves.toBe(
      EXPECTED["paper-wallet-1280.jpeg"],
    );
    expect(NativeDetectorStub.detect).not.toHaveBeenCalled();
  });

  it("falls back to zxing for good once the native detector throws", async () => {
    vi.stubGlobal("BarcodeDetector", NativeDetectorStub);
    NativeDetectorStub.detect.mockRejectedValue(new Error("service unavailable"));
    const video = await fixtureAsVideo("paper-wallet-1280.jpeg");
    const read = createQrFrameReader();

    await expect(read(video)).resolves.toBe(EXPECTED["paper-wallet-1280.jpeg"]);
    await expect(read(video)).resolves.toBe(EXPECTED["paper-wallet-1280.jpeg"]);
    expect(NativeDetectorStub.detect).toHaveBeenCalledOnce();
  });
});
