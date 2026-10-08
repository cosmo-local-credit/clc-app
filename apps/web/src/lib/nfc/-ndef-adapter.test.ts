import type { NfcReading } from "@clc/core/features/nfc/logic";
import { describe, expect, it, vi } from "vite-plus/test";

import { createFakeNdef, domError, urlRecord } from "#/lib/-fixtures/nfc/fake-ndef-reader";
import { claimNfc, createNfcScanner, getNdefReaderConstructor, releaseNfc } from "./ndef-adapter";

describe("getNdefReaderConstructor", () => {
  it("reports no Web NFC in an environment without it", () => {
    expect(getNdefReaderConstructor()).toBeNull();
  });
});

describe("createNfcScanner", () => {
  it("copies records out of the DataView and maps an empty serial to null", async () => {
    const fake = createFakeNdef();
    const readings: NfcReading[] = [];
    const controller = new AbortController();
    await createNfcScanner(fake.Reader).scan(
      { onReading: (reading) => readings.push(reading), onReadingError: vi.fn() },
      controller.signal,
    );
    fake.latest().emit([urlRecord("https://a.b/?w=x"), { recordType: "empty", data: null }]);
    expect(readings).toHaveLength(1);
    const [reading] = readings;
    expect(reading?.serialNumber).toBeNull();
    expect(reading?.records).toHaveLength(2);
    expect(reading?.records[0]?.data).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(reading?.records[0]?.data ?? undefined)).toBe(
      "https://a.b/?w=x",
    );
    expect(reading?.records[1]?.data).toBeNull();
  });

  it("passes the signal to the platform scan", async () => {
    const fake = createFakeNdef();
    const controller = new AbortController();
    await createNfcScanner(fake.Reader).scan(
      { onReading: vi.fn(), onReadingError: vi.fn() },
      controller.signal,
    );
    expect(fake.latest().signal).toBe(controller.signal);
  });

  it("detaches both listeners when the session is aborted", async () => {
    const fake = createFakeNdef();
    const onReading = vi.fn();
    const onReadingError = vi.fn();
    const controller = new AbortController();
    await createNfcScanner(fake.Reader).scan({ onReading, onReadingError }, controller.signal);
    controller.abort();
    fake.latest().emit([urlRecord("https://a.b/?w=x")]);
    fake.latest().emitReadingError();
    expect(onReading).not.toHaveBeenCalled();
    expect(onReadingError).not.toHaveBeenCalled();
  });

  it("rejects with the platform error and leaves no listener behind", async () => {
    const fake = createFakeNdef();
    fake.failNextScan(domError("NotAllowedError"));
    const onReading = vi.fn();
    await expect(
      createNfcScanner(fake.Reader).scan(
        { onReading, onReadingError: vi.fn() },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ name: "NotAllowedError" });
    fake.latest().emit([urlRecord("https://a.b/?w=x")]);
    expect(onReading).not.toHaveBeenCalled();
  });

  it("refuses to start an already aborted session", async () => {
    const fake = createFakeNdef();
    const controller = new AbortController();
    controller.abort();
    await expect(
      createNfcScanner(fake.Reader).scan(
        { onReading: vi.fn(), onReadingError: vi.fn() },
        controller.signal,
      ),
    ).rejects.toBeDefined();
    expect(fake.readers).toHaveLength(0);
  });
});

describe("claimNfc", () => {
  it("gives the tab one owner: a new claim aborts the previous one", () => {
    const first = claimNfc();
    const second = claimNfc();
    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(false);
    releaseNfc(second);
    expect(second.signal.aborted).toBe(true);
  });
});
