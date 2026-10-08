import type { NdefReaderLike } from "#/lib/nfc/ndef-adapter";

type FakeRecord = {
  recordType: string;
  mediaType?: string | null;
  encoding?: string | null;
  data?: DataView | null;
};

/** A browser-shaped URL record: its payload behind a DataView, as Chrome hands it over. */
export function urlRecord(url: string): FakeRecord {
  const bytes = new TextEncoder().encode(url);
  return { recordType: "url", data: new DataView(bytes.buffer) };
}

export function domError(name: string): Error {
  return Object.assign(new Error(name), { name });
}

/**
 * An injectable `NDEFReader` constructor. jsdom has none, and patching the
 * global would hide whether the adapter looks it up lazily, so tests pass this
 * in instead.
 */
export function createFakeNdef() {
  const readers: FakeReader[] = [];
  let nextScanError: Error | null = null;

  class FakeReader extends EventTarget implements NdefReaderLike {
    signal: AbortSignal | undefined;

    constructor() {
      super();
      readers.push(this);
    }

    async scan(options?: { signal?: AbortSignal }): Promise<void> {
      if (nextScanError) {
        const error = nextScanError;
        nextScanError = null;
        throw error;
      }
      this.signal = options?.signal;
    }

    emit(records: FakeRecord[], serialNumber = ""): void {
      this.dispatchEvent(
        Object.assign(new Event("reading"), { serialNumber, message: { records } }),
      );
    }

    emitReadingError(): void {
      this.dispatchEvent(new Event("readingerror"));
    }
  }

  return {
    Reader: FakeReader,
    readers,
    latest: () => readers.at(-1) as FakeReader,
    failNextScan: (error: Error) => {
      nextScanError = error;
    },
  };
}
