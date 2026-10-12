import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createFakeNfc } from "#/lib/nfc/-fake-ndef-reader";
import type { BatchWallet } from "#/features/paper-wallets/use-paper-wallet-batch";
import { NfcWriterPanel } from "./nfc-writer-panel";
import { useNfcWriter } from "./use-nfc-writer";

const urlFor = (id: number) => `https://app.test/?w=0x${(id + 1).toString(16).padStart(64, "0")}`;

const wallets: BatchWallet[] = [0, 1].map((id) => ({
  id,
  address: `0x${(id + 1).toString(16).padStart(40, "0")}` as `0x${string}`,
  recipient: { name: `Holder ${id + 1}`, email: "", phone: "", country: "", currency: "" },
  status: "ready",
}));

function Harness({ Reader }: { Reader: ReturnType<typeof createFakeNfc>["Reader"] }) {
  const writer = useNfcWriter({
    wallets,
    preparing: false,
    urlFor,
    rowForUrl: () => null,
    getReader: () => Reader,
    queryPermission: async () => "granted",
    timing: { rearmDelayMs: 60_000 },
  });
  return <NfcWriterPanel writer={writer} wallets={wallets} urlFor={urlFor} />;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("NfcWriterPanel", () => {
  it("lets the operator enable overwriting with a switch", () => {
    const { Reader } = createFakeNfc();
    render(<Harness Reader={Reader} />);
    const overwrite = screen.getByRole("switch", { name: "Overwrite existing cards" });
    expect(overwrite.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(overwrite);
    expect(overwrite.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("Existing card data will be replaced.")).toBeTruthy();
  });

  it("walks the operator from start to the next card", async () => {
    const { env, Reader } = createFakeNfc();
    render(<Harness Reader={Reader} />);
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("Ready to write");
    expect(screen.getByText(/fits NTAG213/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Start writing" }));
    await waitFor(() => expect(status.textContent).toContain("Present a blank card"));
    expect(status.textContent).toContain("#1 · Holder 1");

    const card = { serialNumber: "04:01", records: [] };
    await act(async () => env.tap(card));
    await waitFor(() => expect(status.textContent).toContain("Written · verifying"));
    await waitFor(() => expect(env.activeScans()).toBe(1));
    await act(async () => env.tap(card));
    await waitFor(() => expect(status.textContent).toContain("Remove card · present next card"));
    expect(status.textContent).toContain("#2 · Holder 2");
  });

  it("offers a rewrite only behind a confirmation", async () => {
    const { env, Reader } = createFakeNfc();
    render(<Harness Reader={Reader} />);
    fireEvent.click(screen.getByRole("button", { name: "Start writing" }));
    await waitFor(() => expect(env.pendingWrites()).toBe(1));
    await act(async () =>
      env.tap({
        serialNumber: "04:09",
        records: [{ recordType: "url", data: "https://menu.example" }],
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("Use a blank card"),
    );

    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(screen.getByRole("button", { name: "Rewrite this card (overwrite)" }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toContain("Use a blank card");

    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Rewrite this card (overwrite)" }));
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("Present the card to overwrite"),
    );
  });
});
