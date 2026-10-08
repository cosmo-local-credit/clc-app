import type {
  NfcReading,
  NfcRecord,
  NfcScanHandlers,
  NfcScanner,
  NfcWriteOptions,
  NfcWriter,
} from "@clc/core/features/nfc/logic";
import { useSyncExternalStore } from "react";

/*
 * The console's Web NFC adapter: the writer's half of the transport contract
 * in `@clc/core/features/nfc/logic`. apps/web has its own scan-only adapter;
 * what they share is the decoding and error rules in core, not this plumbing.
 *
 * Nothing here touches a browser global at import time, so the module is safe
 * to load during SSR. The reader constructor is injected — jsdom has no
 * `NDEFReader`, so tests hand in a fake constructor rather than patching one in.
 */

/** The slice of a Web NFC record this console reads. `data` is a view, not a buffer. */
type NdefRecordLike = {
  recordType: string;
  mediaType?: string | null;
  encoding?: string | null;
  data?: DataView | null;
};

type NdefReadingEventLike = Event & {
  serialNumber?: string | null;
  message: { records: readonly NdefRecordLike[] };
};

/** The slice of Web NFC's `NDEFReader` this console uses. Not in TypeScript's DOM lib. */
export interface NdefReaderLike extends EventTarget {
  scan(options?: { signal?: AbortSignal }): Promise<void>;
  write(
    message: { records: Array<{ recordType: "url"; data: string }> },
    options?: { overwrite?: boolean; signal?: AbortSignal },
  ): Promise<void>;
}

export type NdefReaderConstructor = new () => NdefReaderLike;

/** The platform's reader, or null where Web NFC does not exist (desktop, iOS, SSR). */
export function getNdefReaderConstructor(): NdefReaderConstructor | null {
  const candidate = (globalThis as { NDEFReader?: unknown }).NDEFReader;
  return typeof candidate === "function" ? (candidate as NdefReaderConstructor) : null;
}

const subscribeNever = () => () => {};

/**
 * Whether this browser has Web NFC. False on the server and on the first client
 * render, so hydration matches; the real answer arrives right after.
 */
export function useWebNfcSupported(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () => getNdefReaderConstructor() !== null,
    () => false,
  );
}

function copyBytes(view: DataView | null | undefined): Uint8Array | null {
  if (!view) return null;
  return new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
}

function toNfcReading(event: NdefReadingEventLike): NfcReading {
  const records: NfcRecord[] = event.message.records.map((record) => ({
    recordType: record.recordType,
    mediaType: record.mediaType ?? null,
    encoding: record.encoding ?? null,
    data: copyBytes(record.data),
  }));
  return { serialNumber: event.serialNumber || null, records };
}

function abortError(): DOMException {
  return new DOMException("The NFC operation was aborted.", "AbortError");
}

/**
 * A scanner whose every session is its own reader. Listeners are attached
 * before `scan()` so no early tag is missed, and detached the moment `signal`
 * aborts, so a late event from an ended session cannot reach its handlers.
 *
 * Not `async` on purpose: `reader.scan()` must run in the same task as the tap
 * that started it, or Chrome will not show the first-time permission prompt.
 */
export function createNdefScanner(Reader: NdefReaderConstructor): NfcScanner {
  return {
    scan(handlers: NfcScanHandlers, signal: AbortSignal): Promise<void> {
      if (signal.aborted) return Promise.reject(abortError());
      const reader = new Reader();
      const onReading = (event: Event) => {
        if (!signal.aborted) handlers.onReading(toNfcReading(event as NdefReadingEventLike));
      };
      const onReadingError = () => {
        if (!signal.aborted) handlers.onReadingError();
      };
      const detach = () => {
        reader.removeEventListener("reading", onReading);
        reader.removeEventListener("readingerror", onReadingError);
      };
      reader.addEventListener("reading", onReading);
      reader.addEventListener("readingerror", onReadingError);
      signal.addEventListener("abort", detach, { once: true });
      return reader.scan({ signal }).catch((error: unknown) => {
        detach();
        signal.removeEventListener("abort", detach);
        throw error;
      });
    },
  };
}

/**
 * Writes exactly one URL record per call. `overwrite` is passed through as the
 * caller chose it; this adapter never decides to overwrite on its own.
 */
export function createNdefWriter(Reader: NdefReaderConstructor): NfcWriter {
  return {
    writeUrl(url: string, { overwrite, signal }: NfcWriteOptions): Promise<void> {
      if (signal.aborted) return Promise.reject(abortError());
      return new Reader().write(
        { records: [{ recordType: "url", data: url }] },
        { overwrite, signal },
      );
    },
  };
}

/**
 * The `nfc` permission state, which separates a denied permission from a
 * refused card on `write()`. Null where the browser cannot say.
 */
export async function queryNfcPermission(): Promise<"granted" | "denied" | "prompt" | null> {
  try {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) return null;
    const status = await navigator.permissions.query({ name: "nfc" as PermissionName });
    return status.state;
  } catch {
    return null;
  }
}
