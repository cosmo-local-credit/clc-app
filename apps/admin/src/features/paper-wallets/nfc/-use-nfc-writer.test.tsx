import { issuanceOf } from "@clc/core/features/nfc/issuance";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { createFakeNfc, type FakeCard } from "#/lib/nfc/-fake-ndef-reader";
import type { BatchWallet } from "../use-paper-wallet-batch";
import { useNfcWriter } from "./use-nfc-writer";

const urlFor = (id: number) => `https://app.test/?w=0x${(id + 1).toString(16).padStart(64, "0")}`;
const rowForUrl = (url: string) => {
  const match = /w=0x([0-9a-f]{64})$/.exec(url);
  return match ? Number.parseInt(match[1] as string, 16) - 1 : null;
};

function wallets(ready: number, preparing = 0): BatchWallet[] {
  return Array.from({ length: ready + preparing }, (_, id) => ({
    id,
    address: `0x${(id + 1).toString(16).padStart(40, "0")}` as `0x${string}`,
    recipient: { name: `Holder ${id + 1}`, email: "", phone: "", country: "", currency: "" },
    status: id < ready ? ("ready" as const) : ("preparing" as const),
  }));
}

function blank(serialNumber = "04:00:00:01"): FakeCard {
  return { serialNumber, records: [] };
}

function setup(initial = { wallets: wallets(3), preparing: false }, verifyWindowMs = 5_000) {
  const { env, Reader } = createFakeNfc();
  const hook = renderHook(
    (props: { wallets: BatchWallet[]; preparing: boolean }) =>
      useNfcWriter({
        ...props,
        urlFor,
        rowForUrl,
        getReader: () => Reader,
        queryPermission: async () => "granted",
        timing: { verifyWindowMs, rearmDelayMs: 20 },
      }),
    { initialProps: initial },
  );
  const phase = () => hook.result.current.model.phase;
  return { env, hook, phase };
}

/** Taps a card and lets the write, the state machine and the next effects settle. */
async function tap(env: ReturnType<typeof createFakeNfc>["env"], card: FakeCard) {
  await act(async () => {
    env.tap(card);
  });
}

describe("useNfcWriter", () => {
  it("writes one row per blank card and verifies on a fresh read, not the write's own", async () => {
    const { env, hook, phase } = setup();
    act(() => hook.result.current.start());
    await waitFor(() => expect(env.pendingWrites()).toBe(1));
    expect(phase()).toMatchObject({ phase: "waiting", rowId: 0 });

    const card = blank();
    await tap(env, card);
    expect(card.records).toEqual([{ recordType: "url", data: urlFor(0) }]);
    // The reading dispatched during the write did not verify it.
    await waitFor(() => expect(phase()).toMatchObject({ phase: "verifying", rowId: 0 }));
    expect(issuanceOf(hook.result.current.model, 0).status).toBe("written");

    await waitFor(() => expect(env.activeScans()).toBe(1));
    await tap(env, card);
    await waitFor(() => expect(phase()).toMatchObject({ phase: "waiting", rowId: 1 }));
    expect(issuanceOf(hook.result.current.model, 0).status).toBe("verified");
    expect(hook.result.current.counts).toMatchObject({ verified: 1, remaining: 2 });
    expect(hook.result.current.lastWritten?.rowId).toBe(0);
  });

  it("drops a duplicate reading instead of advancing twice", async () => {
    const { env, hook, phase } = setup();
    act(() => hook.result.current.start());
    await waitFor(() => expect(env.pendingWrites()).toBe(1));
    const card = blank();
    await tap(env, card);
    await waitFor(() => expect(env.activeScans()).toBe(1));

    await act(async () => {
      env.tap(card);
      env.tap(card);
    });
    await waitFor(() => expect(phase()).toMatchObject({ phase: "waiting", rowId: 1 }));
    expect(issuanceOf(hook.result.current.model, 1).status).toBe("pending");
    expect(card.records).toEqual([{ recordType: "url", data: urlFor(0) }]);
  });

  it("refuses the card still on the reader and re-arms the same row for the next one", async () => {
    const { env, hook, phase } = setup({ wallets: wallets(3), preparing: false });
    act(() => hook.result.current.setVerify(false));
    act(() => hook.result.current.start());
    await waitFor(() => expect(env.pendingWrites()).toBe(1));
    const held = blank("04:aa:aa:aa");
    await tap(env, held);
    await waitFor(() => expect(env.pendingWrites()).toBe(1));
    expect(phase()).toMatchObject({ phase: "waiting", rowId: 1 });

    await tap(env, held);
    await waitFor(() =>
      expect(phase()).toMatchObject({ phase: "blocked", rowId: 1, reason: "card-still-present" }),
    );
    expect(held.records).toEqual([{ recordType: "url", data: urlFor(0) }]);
    expect(issuanceOf(hook.result.current.model, 1).status).toBe("pending");

    await waitFor(() => expect(phase()).toMatchObject({ phase: "waiting", rowId: 1 }));
    await waitFor(() => expect(env.pendingWrites()).toBe(1));
    const next = blank("04:bb:bb:bb");
    await tap(env, next);
    expect(next.records).toEqual([{ recordType: "url", data: urlFor(1) }]);
    await waitFor(() => expect(phase()).toMatchObject({ phase: "waiting", rowId: 2 }));
  });

  it("recognizes the held card by its payload when the phone gives no serial", async () => {
    const { env, hook, phase } = setup();
    act(() => hook.result.current.setVerify(false));
    act(() => hook.result.current.start());
    await waitFor(() => expect(env.pendingWrites()).toBe(1));
    const held = blank("");
    await tap(env, held);
    await waitFor(() => expect(phase()).toMatchObject({ phase: "waiting", rowId: 1 }));
    await waitFor(() => expect(env.pendingWrites()).toBe(1));
    await tap(env, held);
    await waitFor(() =>
      expect(phase()).toMatchObject({ phase: "blocked", reason: "card-still-present" }),
    );

    // A different card, also without a serial, is not mistaken for it.
    act(() => hook.result.current.start());
    await waitFor(() => expect(env.pendingWrites()).toBe(1));
    await tap(env, {
      serialNumber: "",
      records: [{ recordType: "url", data: "https://menu.example" }],
    });
    await waitFor(() => expect(phase()).toMatchObject({ phase: "blocked", reason: "occupied" }));
  });

  it("names the row a card already carries, without touching either row", async () => {
    const { env, hook, phase } = setup();
    act(() => hook.result.current.start());
    await waitFor(() => expect(env.pendingWrites()).toBe(1));
    await tap(env, {
      serialNumber: "04:cc",
      records: [{ recordType: "url", data: urlFor(2) }],
    });
    await waitFor(() =>
      expect(phase()).toMatchObject({ phase: "blocked", reason: "already-issued", issuedRowId: 2 }),
    );
    expect(issuanceOf(hook.result.current.model, 0).status).toBe("pending");
    expect(issuanceOf(hook.result.current.model, 2).status).toBe("pending");
  });

  it("holds a mismatched verification for the operator and retries the same row", async () => {
    const { env, hook, phase } = setup();
    act(() => hook.result.current.start());
    await waitFor(() => expect(env.pendingWrites()).toBe(1));
    await tap(env, blank());
    await waitFor(() => expect(env.activeScans()).toBe(1));
    await tap(env, { serialNumber: "04:dd", records: [{ recordType: "text", data: "other" }] });

    await waitFor(() =>
      expect(phase()).toEqual({ phase: "attention", rowId: 0, reason: "verify-mismatch" }),
    );
    expect(issuanceOf(hook.result.current.model, 0).status).toBe("pending");
    expect(issuanceOf(hook.result.current.model, 1).status).toBe("pending");

    act(() => hook.result.current.retry());
    await waitFor(() =>
      expect(phase()).toMatchObject({ phase: "waiting", rowId: 0, overwrite: false }),
    );
  });

  it("asks for a retap when the held card does not read back", async () => {
    const { env, hook, phase } = setup(undefined, 30);
    act(() => hook.result.current.start());
    await waitFor(() => expect(env.pendingWrites()).toBe(1));
    const card = blank();
    await tap(env, card);
    await waitFor(() => expect(phase()).toMatchObject({ phase: "verifying", retap: true }));
    await waitFor(() => expect(env.activeScans()).toBe(1));
    await tap(env, card);
    await waitFor(() => expect(issuanceOf(hook.result.current.model, 0).status).toBe("verified"));
  });

  it("keeps the row on an interrupted write and retries it with the same payload", async () => {
    const { env, hook, phase } = setup();
    act(() => hook.result.current.start());
    await waitFor(() => expect(env.pendingWrites()).toBe(1));
    env.failNextWrite = "NetworkError";
    await tap(env, blank());
    await waitFor(() =>
      expect(phase()).toEqual({ phase: "attention", rowId: 0, reason: "transfer-failed" }),
    );

    act(() => hook.result.current.setAside());
    expect(hook.result.current.model.setAside).toBe(1);
    await waitFor(() => expect(env.pendingWrites()).toBe(1));
    const fresh = blank("04:ee");
    await tap(env, fresh);
    expect(fresh.records).toEqual([{ recordType: "url", data: urlFor(0) }]);
  });

  it("overwrites only after a deliberate rewrite", async () => {
    const { env, hook, phase } = setup();
    act(() => hook.result.current.start());
    await waitFor(() => expect(env.pendingWrites()).toBe(1));
    const foreign: FakeCard = {
      serialNumber: "04:ff",
      records: [{ recordType: "url", data: "https://menu.example" }],
    };
    await tap(env, foreign);
    await waitFor(() => expect(phase()).toMatchObject({ phase: "blocked", reason: "occupied" }));
    expect(foreign.records[0]?.data).toBe("https://menu.example");

    act(() => hook.result.current.rewrite(0));
    await waitFor(() => expect(phase()).toMatchObject({ phase: "waiting", overwrite: true }));
    await waitFor(() => expect(env.pendingWrites()).toBe(1));
    await tap(env, foreign);
    expect(foreign.records).toEqual([{ recordType: "url", data: urlFor(0) }]);
  });

  it("pauses without writing and resumes the same row on an explicit action", async () => {
    const { env, hook, phase } = setup();
    act(() => hook.result.current.start());
    await waitFor(() => expect(env.pendingWrites()).toBe(1));

    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    expect(phase()).toEqual({ phase: "paused", rowId: 0 });
    await waitFor(() => expect(env.pendingWrites()).toBe(0));
    expect(env.activeScans()).toBe(0);

    const card = blank();
    await tap(env, card);
    expect(card.records).toEqual([]);

    act(() => hook.result.current.start());
    await waitFor(() => expect(phase()).toMatchObject({ phase: "waiting", rowId: 0 }));
  });

  it("starts once a ready buffer exists and waits for rows still preparing", async () => {
    const { env, hook, phase } = setup({ wallets: wallets(2, 8), preparing: true });
    expect(hook.result.current.canStart).toBe(false);
    expect(hook.result.current.readyThreshold).toBe(5);

    hook.rerender({ wallets: wallets(5, 5), preparing: true });
    expect(hook.result.current.canStart).toBe(true);
    act(() => hook.result.current.setVerify(false));
    act(() => hook.result.current.start());
    for (let row = 0; row < 5; row += 1) {
      await waitFor(() => expect(env.pendingWrites()).toBe(1));
      await tap(env, blank(`04:${row}`));
    }
    await waitFor(() => expect(phase()).toEqual({ phase: "starved" }));

    hook.rerender({ wallets: wallets(6, 4), preparing: true });
    await waitFor(() => expect(phase()).toMatchObject({ phase: "waiting", rowId: 5 }));
  });

  it("stops when NFC permission is denied", async () => {
    const { env, hook, phase } = setup();
    env.failNextScan = "NotAllowedError";
    act(() => hook.result.current.start());
    await waitFor(() => expect(phase()).toEqual({ phase: "stopped", error: "permission-denied" }));
    await waitFor(() => expect(env.pendingWrites()).toBe(0));
  });
});
