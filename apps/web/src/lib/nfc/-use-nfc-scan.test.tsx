import type { NfcReading } from "@clc/core/features/nfc/logic";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createFakeNdef, domError, urlRecord } from "#/lib/-fixtures/nfc/fake-ndef-reader";
import { type NfcTagOutcome, useNfcScan } from "./use-nfc-scan";

const CARD = [urlRecord("https://cosmolocal.credit/?w=0x1")];

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: state });
  document.dispatchEvent(new Event("visibilitychange"));
}

afterEach(() => {
  setVisibility("visible");
});

async function started(onTag: (reading: NfcReading) => NfcTagOutcome | Promise<NfcTagOutcome>) {
  const fake = createFakeNdef();
  const hook = renderHook(() => useNfcScan({ onTag, Reader: fake.Reader }));
  act(() => hook.result.current.start());
  await waitFor(() => expect(hook.result.current.phase).toBe("ready"));
  return { fake, hook };
}

describe("useNfcScan", () => {
  it("is ready once the scan starts, not once a card is read", async () => {
    const onTag = vi.fn((): NfcTagOutcome => "continue");
    const { hook } = await started(onTag);
    expect(hook.result.current.phase).toBe("ready");
    expect(onTag).not.toHaveBeenCalled();
  });

  it("reports unsupported without a reader and never retries", () => {
    const hook = renderHook(() => useNfcScan({ onTag: vi.fn(), Reader: null }));
    act(() => hook.result.current.start());
    expect(hook.result.current.phase).toBe("error");
    expect(hook.result.current.error).toBe("unsupported");
  });

  it("surfaces a permission denial once, with no retry loop", async () => {
    const fake = createFakeNdef();
    fake.failNextScan(domError("NotAllowedError"));
    const hook = renderHook(() => useNfcScan({ onTag: vi.fn(), Reader: fake.Reader }));
    act(() => hook.result.current.start());
    await waitFor(() => expect(hook.result.current.phase).toBe("error"));
    expect(hook.result.current.error).toBe("permission-denied");
    expect(fake.readers).toHaveLength(1);
  });

  it("handles one tag at a time: a duplicate event during handling is dropped", async () => {
    let finish: (outcome: NfcTagOutcome) => void = () => {};
    const onTag = vi.fn(
      () =>
        new Promise<NfcTagOutcome>((resolve) => {
          finish = resolve;
        }),
    );
    const { fake, hook } = await started(onTag);
    act(() => {
      fake.latest().emit(CARD);
      fake.latest().emit(CARD);
      fake.latest().emit(CARD);
    });
    await waitFor(() => expect(onTag).toHaveBeenCalledTimes(1));
    expect(hook.result.current.phase).toBe("handling");
    await act(async () => finish("continue"));
    expect(hook.result.current.phase).toBe("ready");
    act(() => fake.latest().emit(CARD));
    await waitFor(() => expect(onTag).toHaveBeenCalledTimes(2));
  });

  it("ends the session after a tag handled as done", async () => {
    const { fake, hook } = await started(() => "done");
    act(() => fake.latest().emit(CARD));
    await waitFor(() => expect(hook.result.current.phase).toBe("complete"));
    expect(fake.latest().signal?.aborted).toBe(true);
  });

  it("drops a late reading from a cancelled session", async () => {
    const onTag = vi.fn((): NfcTagOutcome => "continue");
    const { fake, hook } = await started(onTag);
    const stale = fake.latest();
    act(() => hook.result.current.stop());
    expect(hook.result.current.phase).toBe("cancelled");
    act(() => stale.emit(CARD));
    await Promise.resolve();
    expect(onTag).not.toHaveBeenCalled();
  });

  it("ignores a stale session's reading after a restart", async () => {
    const onTag = vi.fn((): NfcTagOutcome => "continue");
    const { fake, hook } = await started(onTag);
    const first = fake.latest();
    act(() => hook.result.current.start());
    await waitFor(() => expect(fake.readers).toHaveLength(2));
    act(() => first.emit(CARD));
    await Promise.resolve();
    expect(onTag).not.toHaveBeenCalled();
  });

  it("keeps one reader across renders with a new callback identity", async () => {
    const fake = createFakeNdef();
    const hook = renderHook(({ tag }) => useNfcScan({ onTag: tag, Reader: fake.Reader }), {
      initialProps: { tag: vi.fn((): NfcTagOutcome => "continue") },
    });
    act(() => hook.result.current.start());
    await waitFor(() => expect(hook.result.current.phase).toBe("ready"));
    const next = vi.fn((): NfcTagOutcome => "continue");
    hook.rerender({ tag: next });
    expect(fake.readers).toHaveLength(1);
    act(() => fake.latest().emit(CARD));
    await waitFor(() => expect(next).toHaveBeenCalledTimes(1));
  });

  it("stops when the page is hidden and does not resume on return", async () => {
    const { fake, hook } = await started(() => "continue");
    act(() => setVisibility("hidden"));
    expect(hook.result.current.phase).toBe("cancelled");
    expect(fake.latest().signal?.aborted).toBe(true);
    act(() => setVisibility("visible"));
    expect(hook.result.current.phase).toBe("cancelled");
    expect(fake.readers).toHaveLength(1);
  });

  it("aborts its session on unmount", async () => {
    const { fake, hook } = await started(() => "continue");
    hook.unmount();
    expect(fake.latest().signal?.aborted).toBe(true);
  });

  it("flags an unreadable tag without treating it as empty", async () => {
    const onTag = vi.fn((): NfcTagOutcome => "continue");
    const { fake, hook } = await started(onTag);
    act(() => fake.latest().emitReadingError());
    expect(hook.result.current.readFailed).toBe(true);
    expect(onTag).not.toHaveBeenCalled();
  });
});
