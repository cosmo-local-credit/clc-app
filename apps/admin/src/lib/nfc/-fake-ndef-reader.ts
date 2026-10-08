import type { NdefReaderConstructor, NdefReaderLike } from "./ndef-adapter";

/*
 * A stand-in for Chrome's Web NFC, for tests. It is a constructor handed to the
 * code under test, never a patched global, so each test owns its own radio.
 */

export type FakeRecord = { recordType: string; mediaType?: string; data?: string };

export type FakeCard = { serialNumber: string; records: FakeRecord[] };

type PendingWrite = {
  url: string;
  overwrite: boolean;
  signal?: AbortSignal;
  resolve: () => void;
  reject: (error: unknown) => void;
};

function domError(name: string): DOMException {
  return new DOMException(name, name);
}

export function createFakeNfc() {
  const scanning = new Set<FakeReader>();
  const writes: PendingWrite[] = [];
  const env = {
    /** Rejects the next `scan()` with this error name, e.g. "NotAllowedError". */
    failNextScan: null as string | null,
    /** Rejects the next write that meets a card with this error name, e.g. "NetworkError". */
    failNextWrite: null as string | null,
    scans: 0,
    listenerCount: () => [...scanning].reduce((count, reader) => count + reader.listeners, 0),
    activeScans: () => scanning.size,
    pendingWrites: () => writes.filter((write) => !write.signal?.aborted).length,
    /**
     * A card enters the field: every active scan sees it, then the oldest
     * pending write is attempted against it.
     */
    tap(card: FakeCard): void {
      for (const reader of Array.from(scanning)) reader.emit(card);
      const write = writes.shift();
      if (!write) return;
      if (write.signal?.aborted) {
        env.tap(card);
        return;
      }
      if (env.failNextWrite) {
        const name = env.failNextWrite;
        env.failNextWrite = null;
        write.reject(domError(name));
        return;
      }
      const occupied = card.records.some((record) => record.recordType !== "empty");
      if (occupied && !write.overwrite) {
        write.reject(domError("NotAllowedError"));
        return;
      }
      card.records = [{ recordType: "url", data: write.url }];
      write.resolve();
    },
    /** A tag the platform detected but could not read. */
    unreadable(): void {
      for (const reader of Array.from(scanning)) reader.dispatchEvent(new Event("readingerror"));
    },
  };

  class FakeReader extends EventTarget implements NdefReaderLike {
    listeners = 0;

    override addEventListener(...args: Parameters<EventTarget["addEventListener"]>) {
      this.listeners += 1;
      super.addEventListener(...args);
    }

    override removeEventListener(...args: Parameters<EventTarget["removeEventListener"]>) {
      this.listeners -= 1;
      super.removeEventListener(...args);
    }

    scan(options?: { signal?: AbortSignal }): Promise<void> {
      env.scans += 1;
      if (env.failNextScan) {
        const name = env.failNextScan;
        env.failNextScan = null;
        return Promise.reject(domError(name));
      }
      if (options?.signal?.aborted) return Promise.reject(domError("AbortError"));
      scanning.add(this);
      options?.signal?.addEventListener("abort", () => scanning.delete(this), { once: true });
      return Promise.resolve();
    }

    write(
      message: { records: Array<{ recordType: "url"; data: string }> },
      options?: { overwrite?: boolean; signal?: AbortSignal },
    ): Promise<void> {
      return new Promise((resolve, reject) => {
        const url = message.records[0]?.data ?? "";
        const pending = {
          url,
          overwrite: options?.overwrite ?? true,
          signal: options?.signal,
          resolve,
          reject,
        };
        options?.signal?.addEventListener("abort", () => reject(domError("AbortError")), {
          once: true,
        });
        writes.push(pending);
      });
    }

    emit(card: FakeCard): void {
      const encoder = new TextEncoder();
      const event = Object.assign(new Event("reading"), {
        serialNumber: card.serialNumber,
        message: {
          records: card.records.map((record) => ({
            recordType: record.recordType,
            mediaType: record.mediaType ?? null,
            encoding: record.recordType === "text" ? "utf-8" : null,
            data:
              record.data === undefined ? null : new DataView(encoder.encode(record.data).buffer),
          })),
        },
      });
      this.dispatchEvent(event);
    }
  }

  return { env, Reader: FakeReader as NdefReaderConstructor };
}
