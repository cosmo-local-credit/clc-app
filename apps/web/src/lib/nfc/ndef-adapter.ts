import type {
  NfcReading,
  NfcRecord,
  NfcScanHandlers,
  NfcScanner,
} from "@clc/core/features/nfc/logic";
import { useSyncExternalStore } from "react";

/**
 * Web NFC for apps/web, which only ever scans: sign-in and card collection read
 * a card, and nothing in this app writes one.
 *
 * lib.dom has no Web NFC types, so the slice used here is declared locally. A
 * record's `data` is a `DataView` over the payload, copied out to a plain
 * `Uint8Array` before anything outside this file sees it.
 *
 * Nothing here touches a browser global at import time; the constructor is
 * looked up when an operation starts, so the module is safe to import during
 * SSR. Tests inject a fake constructor rather than patching `window`.
 */

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

export interface NdefReaderLike extends EventTarget {
  scan(options?: { signal?: AbortSignal }): Promise<void>;
}

export type NdefReaderConstructor = new () => NdefReaderLike;

export function getNdefReaderConstructor(): NdefReaderConstructor | null {
  if (typeof window === "undefined") return null;
  const candidate = (window as unknown as { NDEFReader?: unknown }).NDEFReader;
  return typeof candidate === "function" ? (candidate as NdefReaderConstructor) : null;
}

function toNfcRecord(record: NdefRecordLike): NfcRecord {
  const view = record.data;
  return {
    recordType: record.recordType,
    mediaType: record.mediaType ?? null,
    encoding: record.encoding ?? null,
    data: view
      ? new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength))
      : null,
  };
}

function toNfcReading(event: NdefReadingEventLike): NfcReading {
  return {
    serialNumber: event.serialNumber || null,
    records: event.message.records.map(toNfcRecord),
  };
}

/**
 * A scanner whose every session is one reader, one pair of listeners and one
 * signal. Listeners go on before `scan()` so no early tag is missed, and come
 * off when the signal aborts, so a cancelled session cannot call back.
 *
 * `scan()` runs synchronously up to the platform call, which keeps it inside
 * the click that started it — the first permission prompt needs that gesture.
 */
export function createNfcScanner(Reader: NdefReaderConstructor): NfcScanner {
  return {
    async scan(handlers: NfcScanHandlers, signal: AbortSignal) {
      signal.throwIfAborted();
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
      try {
        await reader.scan({ signal });
      } catch (error) {
        detach();
        throw error;
      }
    },
  };
}

/**
 * One workflow owns NFC per tab. Claiming aborts whoever held it, so sign-in
 * and collection can never both answer the same tag.
 */
let owner: AbortController | null = null;

export function claimNfc(): AbortController {
  owner?.abort();
  owner = new AbortController();
  return owner;
}

export function releaseNfc(controller: AbortController): void {
  controller.abort();
  if (owner === controller) owner = null;
}

const subscribeToNothing = () => () => {};

/**
 * Whether this browser exposes Web NFC. False on the server and through
 * hydration, so the NFC option appears after hydration rather than causing a
 * mismatch. This capability check alone decides visibility.
 */
export function useWebNfcSupported(): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    () => getNdefReaderConstructor() !== null,
    () => false,
  );
}
