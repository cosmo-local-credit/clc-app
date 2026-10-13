import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createFakeNfc } from "#/lib/nfc/-fake-ndef-reader";
import type { BatchWallet } from "#/features/paper-wallets/use-paper-wallet-batch";

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  downloadBlob: vi.fn(),
  phase: "idle",
  wallets: [] as BatchWallet[],
}));

vi.mock("#/features/paper-wallets/use-paper-wallet-batch", () => ({
  usePaperWalletBatch: () => ({
    wallets: mocks.wallets,
    phase: mocks.phase,
    encrypted: 0,
    toEncrypt: 0,
    start: mocks.start,
    retryFailed: vi.fn(),
    reset: vi.fn(),
    qrUrlFor: (id: number) => `https://app.test/?w=0x${String(id).padStart(64, "1")}`,
    rowForUrl: () => null,
  }),
}));
vi.mock("#/features/paper-wallets/download", () => ({ downloadBlob: mocks.downloadBlob }));

import { NfcCardsPage } from "./nfc-cards-page";

beforeEach(() => {
  mocks.start.mockReset();
  mocks.downloadBlob.mockReset();
  mocks.phase = "idle";
  mocks.wallets = [];
  vi.stubGlobal("NDEFReader", createFakeNfc().Reader);
});

afterEach(() => vi.unstubAllGlobals());

describe("NfcCardsPage", () => {
  it("prepares cards without profile or print setup", () => {
    render(<NfcCardsPage />);
    expect(screen.getByRole("heading", { name: "NFC cards" })).toBeTruthy();
    expect(screen.queryByLabelText("Printed name")).toBeNull();
    expect(screen.queryByLabelText("CSV file")).toBeNull();
    expect(screen.queryByText(/A4|cut lines|Card design/)).toBeNull();

    fireEvent.change(screen.getByLabelText("Number of cards"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "sunflower" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "sunflower" } });
    fireEvent.click(screen.getByRole("button", { name: "Prepare 3 cards" }));

    expect(mocks.start).toHaveBeenCalledWith(
      Array.from({ length: 3 }, () => ({
        recipient: { name: "", email: "", phone: "", country: "", currency: "" },
        passphrase: "sunflower",
      })),
      { encryptWorkers: 2, useAddressAsName: true },
    );
  });

  it("offers writing and a manifest without a PDF download", () => {
    mocks.phase = "done";
    mocks.wallets = [0, 1].map((id) => ({
      id,
      address: `0x${String(id + 1).repeat(40)}`,
      recipient: { name: "", email: "", phone: "", country: "", currency: "" },
      status: "ready",
    }));
    render(<NfcCardsPage />);

    expect(screen.getByRole("region", { name: "NFC card writer" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start writing" })).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Overwrite existing cards" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Manifest CSV" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /PDF/ })).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "Name" })).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "Contact" })).toBeNull();

    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("prevents preparation on an unsupported device", () => {
    vi.stubGlobal("NDEFReader", undefined);
    render(<NfcCardsPage />);
    fireEvent.click(screen.getByRole("button", { name: "No password" }));
    expect(screen.getByText("Use Chrome on an Android phone with NFC.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Prepare 10 cards" }).hasAttribute("disabled")).toBe(
      true,
    );
    expect(mocks.start).not.toHaveBeenCalled();
  });
});
