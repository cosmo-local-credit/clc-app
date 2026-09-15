import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const OWNER = "0xabc0000000000000000000000000000000000123";

vi.mock("#/features/auth/hooks/use-storage-owner", () => ({
  useStorageOwner: () => OWNER,
}));

import {
  readAddressBookEntries,
  saveAddressBookEntry,
} from "#/features/wallet/api/address-book-storage";
import { AddressBookSheet } from "./address-book-sheet";

const ALICE = "0xa316408425cF17F1827483dee621c6C3A9B5fad4";
const BOB = "0xb316408425cF17F1827483dee621c6C3A9B5fad4";

function renderSheet(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function renderOpenSheet(onSelect = vi.fn()) {
  renderSheet(<AddressBookSheet open onOpenChange={vi.fn()} onSelect={onSelect} owner={OWNER} />);
  return onSelect;
}

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("AddressBookSheet", () => {
  it("shows the resolved name over the address", async () => {
    saveAddressBookEntry(OWNER, {
      address: ALICE,
      ensName: "alice.sarafu.eth",
      phone: null,
      source: "ens",
    });
    renderOpenSheet();

    expect(await screen.findByText("alice.sarafu.eth")).toBeTruthy();
  });

  it("saves a nickname from the row's inline editor", async () => {
    saveAddressBookEntry(OWNER, {
      address: ALICE,
      ensName: "alice.sarafu.eth",
      phone: null,
      source: "ens",
    });
    renderOpenSheet();

    fireEvent.click(await screen.findByRole("button", { name: /edit alice\.sarafu\.eth/i }));
    fireEvent.change(screen.getByRole("textbox", { name: /nickname/i }), {
      target: { value: "Mom" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save nickname/i }));

    expect(await screen.findByText("Mom")).toBeTruthy();
    await waitFor(() => {
      expect(readAddressBookEntries(OWNER)[0]).toMatchObject({
        nickname: "Mom",
        // The resolved name survives the rename — it is still shown beneath.
        ensName: "alice.sarafu.eth",
      });
    });
    expect(screen.getByText("alice.sarafu.eth")).toBeTruthy();
  });

  it("clears the nickname back to the resolved name on an emptied field", async () => {
    saveAddressBookEntry(OWNER, {
      address: ALICE,
      ensName: "alice.sarafu.eth",
      phone: null,
      source: "ens",
    });
    renderOpenSheet();

    fireEvent.click(await screen.findByRole("button", { name: /edit alice\.sarafu\.eth/i }));
    fireEvent.change(screen.getByRole("textbox", { name: /nickname/i }), {
      target: { value: "Mom" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save nickname/i }));

    fireEvent.click(await screen.findByRole("button", { name: /edit mom/i }));
    fireEvent.change(screen.getByRole("textbox", { name: /nickname/i }), {
      target: { value: "  " },
    });
    fireEvent.click(screen.getByRole("button", { name: /save nickname/i }));

    await waitFor(() => {
      expect(readAddressBookEntries(OWNER)[0]).toMatchObject({ nickname: null });
    });
    expect(screen.queryByText("Mom")).toBeNull();
  });

  // Editing one row must not take the others out of service — the sheet is
  // still the picker the send flow opened it as.
  it("keeps another row selectable while one is being edited", async () => {
    saveAddressBookEntry(OWNER, {
      address: ALICE,
      ensName: "alice.sarafu.eth",
      phone: null,
      source: "ens",
    });
    saveAddressBookEntry(OWNER, {
      address: BOB,
      ensName: "bob.sarafu.eth",
      phone: null,
      source: "ens",
    });
    const onSelect = renderOpenSheet();

    fireEvent.click(await screen.findByRole("button", { name: /edit alice\.sarafu\.eth/i }));
    fireEvent.click(screen.getByText("bob.sarafu.eth"));

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: BOB.toLowerCase() }));
  });

  it("removes a contact from the editor", async () => {
    saveAddressBookEntry(OWNER, {
      address: ALICE,
      ensName: "alice.sarafu.eth",
      phone: null,
      source: "ens",
    });
    renderOpenSheet();

    fireEvent.click(await screen.findByRole("button", { name: /edit alice\.sarafu\.eth/i }));
    fireEvent.click(screen.getByRole("button", { name: /remove contact/i }));

    await waitFor(() => {
      expect(readAddressBookEntries(OWNER)).toEqual([]);
    });
    expect(await screen.findByText(/no saved recipients yet/i)).toBeTruthy();
  });
});
