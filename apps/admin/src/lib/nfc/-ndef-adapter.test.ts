import { classifyNfcError } from "@clc/core/features/nfc/logic";
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createFakeNfc } from "./-fake-ndef-reader";
import {
  createNdefScanner,
  createNdefWriter,
  getNdefReaderConstructor,
  queryNfcPermission,
  useWebNfcSupported,
} from "./ndef-adapter";

const URL_A = "https://app.test/?w=0xaaa";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("support detection", () => {
  it("reports no Web NFC where the browser has none", () => {
    expect(getNdefReaderConstructor()).toBeNull();
    expect(renderHook(() => useWebNfcSupported()).result.current).toBe(false);
  });

  it("finds the platform constructor only when an operation asks for it", () => {
    const { Reader } = createFakeNfc();
    vi.stubGlobal("NDEFReader", Reader);
    expect(getNdefReaderConstructor()).toBe(Reader);
    expect(renderHook(() => useWebNfcSupported()).result.current).toBe(true);
  });

  it("answers null when the permission cannot be queried", async () => {
    await expect(queryNfcPermission()).resolves.toBeNull();
  });
});

describe("createNdefScanner", () => {
  it("delivers decoded records with every record kept and an empty serial as null", async () => {
    const { env, Reader } = createFakeNfc();
    const onReading = vi.fn();
    await createNdefScanner(Reader).scan(
      { onReading, onReadingError: vi.fn() },
      new AbortController().signal,
    );
    env.tap({
      serialNumber: "",
      records: [
        { recordType: "url", data: URL_A },
        { recordType: "text", data: "hello" },
      ],
    });
    const reading = onReading.mock.calls[0]?.[0];
    expect(reading.serialNumber).toBeNull();
    expect(reading.records).toHaveLength(2);
    expect(new TextDecoder().decode(reading.records[0].data)).toBe(URL_A);
    expect(reading.records[1]).toMatchObject({ recordType: "text", encoding: "utf-8" });
  });

  it("detaches its listeners on abort, so a late tag reaches nobody", async () => {
    const { env, Reader } = createFakeNfc();
    const onReading = vi.fn();
    const controller = new AbortController();
    await createNdefScanner(Reader).scan({ onReading, onReadingError: vi.fn() }, controller.signal);
    expect(env.listenerCount()).toBe(2);
    controller.abort();
    expect(env.listenerCount()).toBe(0);
    env.tap({ serialNumber: "04:01", records: [] });
    expect(onReading).not.toHaveBeenCalled();
  });

  it("reports an unreadable tag separately from a reading", async () => {
    const { env, Reader } = createFakeNfc();
    const onReadingError = vi.fn();
    await createNdefScanner(Reader).scan(
      { onReading: vi.fn(), onReadingError },
      new AbortController().signal,
    );
    env.unreadable();
    expect(onReadingError).toHaveBeenCalledTimes(1);
  });

  it("surfaces a denied permission and leaves no listener behind", async () => {
    const { env, Reader } = createFakeNfc();
    env.failNextScan = "NotAllowedError";
    const error = await createNdefScanner(Reader)
      .scan({ onReading: vi.fn(), onReadingError: vi.fn() }, new AbortController().signal)
      .catch((reason: unknown) => reason);
    expect(classifyNfcError(error, { operation: "scan" })).toBe("permission-denied");
    expect(env.listenerCount()).toBe(0);
  });

  it("refuses to start an already-aborted session", async () => {
    const { env, Reader } = createFakeNfc();
    const controller = new AbortController();
    controller.abort();
    const error = await createNdefScanner(Reader)
      .scan({ onReading: vi.fn(), onReadingError: vi.fn() }, controller.signal)
      .catch((reason: unknown) => reason);
    expect(classifyNfcError(error, { operation: "scan" })).toBe("aborted");
    expect(env.scans).toBe(0);
  });
});

describe("createNdefWriter", () => {
  it("writes exactly one URL record to a blank card", async () => {
    const { env, Reader } = createFakeNfc();
    const card = { serialNumber: "04:02", records: [] };
    const written = createNdefWriter(Reader).writeUrl(URL_A, {
      overwrite: false,
      signal: new AbortController().signal,
    });
    env.tap(card);
    await written;
    expect(card.records).toEqual([{ recordType: "url", data: URL_A }]);
  });

  it("refuses an occupied card under overwrite: false", async () => {
    const { env, Reader } = createFakeNfc();
    const card = { serialNumber: "04:03", records: [{ recordType: "url", data: "https://x" }] };
    const written = createNdefWriter(Reader)
      .writeUrl(URL_A, { overwrite: false, signal: new AbortController().signal })
      .catch((reason: unknown) => reason);
    env.tap(card);
    expect(classifyNfcError(await written, { operation: "write", tagHadRecords: true })).toBe(
      "tag-occupied",
    );
    expect(card.records).toEqual([{ recordType: "url", data: "https://x" }]);
  });

  it("cancels a pending write", async () => {
    const { env, Reader } = createFakeNfc();
    const controller = new AbortController();
    const written = createNdefWriter(Reader)
      .writeUrl(URL_A, { overwrite: false, signal: controller.signal })
      .catch((reason: unknown) => reason);
    controller.abort();
    expect(classifyNfcError(await written, { operation: "write" })).toBe("aborted");
    expect(env.pendingWrites()).toBe(0);
  });
});
