/** Loaded only when QR decoding needs the WebAssembly fallback. */
import { prepareZXingModule, type ReaderOptions, readBarcodes } from "zxing-wasm/reader";
import zxingWasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";

prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) =>
      path.endsWith(".wasm") ? zxingWasmUrl : prefix + path,
  },
});

const READER_OPTIONS: ReaderOptions = {
  formats: ["QRCode"],
  maxNumberOfSymbols: 1,
  // The raw payload, not a human-readable rendering of it.
  textMode: "Plain",
};

export async function readQrWithZXing(pixels: ImageData): Promise<string | null> {
  const results = await readBarcodes(pixels, READER_OPTIONS);
  return results.find((result) => result.isValid)?.text ?? null;
}
