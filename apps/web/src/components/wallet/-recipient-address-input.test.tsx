import { CHAIN_ID } from "#/lib/chain";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const ADDRESS = "0xa316408425cF17F1827483dee621c6C3A9B5fad4";

vi.mock("#/components/paper-wallet-scanner", () => ({
  PaperWalletScanner: ({ onKeyDecoded }: { onKeyDecoded: (value: string) => void }) => (
    <button type="button" onClick={() => onKeyDecoded(`ethereum:${ADDRESS}?value=1`)}>
      Decode QR
    </button>
  ),
}));

import { RecipientAddressInput } from "./recipient-address-input";

function renderInput(onRecipientChange = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RecipientAddressInput
        id="recipient"
        ariaLabel="Recipient"
        onRecipientChange={onRecipientChange}
      />
    </QueryClientProvider>,
  );
  return onRecipientChange;
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RecipientAddressInput", () => {
  it("returns a directly entered address without replacing the text the user entered", async () => {
    const onRecipientChange = renderInput();
    const input = screen.getByRole("textbox", { name: "Recipient" });

    fireEvent.change(input, { target: { value: ADDRESS } });

    await waitFor(() =>
      expect(onRecipientChange).toHaveBeenLastCalledWith({
        address: ADDRESS,
        name: null,
        source: "manual",
      }),
    );
    expect((input as HTMLInputElement).value).toBe(ADDRESS);
  });

  it("selects an internal username and clears selection when the query changes", async () => {
    const fetcher = vi.fn().mockImplementation(() =>
      Promise.resolve(
        json({
          ok: true,
          result: {
            recipients: [
              { kind: "user", name: "Alice", alias: "alice", address: ADDRESS, chainId: CHAIN_ID },
            ],
          },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetcher);
    const onRecipientChange = renderInput();
    const input = screen.getByRole("textbox", { name: "Recipient" });
    fireEvent.change(input, { target: { value: "alice" } });
    fireEvent.click(await screen.findByRole("button", { name: /Alice \(alice\)/ }));
    await waitFor(() =>
      expect(onRecipientChange).toHaveBeenLastCalledWith({
        address: ADDRESS,
        name: "Alice (alice)",
        source: "alias",
      }),
    );
    fireEvent.change(input, { target: { value: "different" } });
    await waitFor(() => expect(onRecipientChange).toHaveBeenLastCalledWith(null));
    expect(fetcher.mock.calls.every(([url]) => String(url).includes("/api/v2/recipients"))).toBe(
      true,
    );
  });

  it("extracts a recipient address from a scanned QR payload", async () => {
    const onRecipientChange = renderInput();

    fireEvent.click(screen.getByRole("button", { name: "Scan QR" }));
    fireEvent.click(screen.getByRole("button", { name: "Decode QR" }));

    await waitFor(() =>
      expect(onRecipientChange).toHaveBeenLastCalledWith({
        address: ADDRESS,
        name: null,
        source: "qr",
      }),
    );
    expect((screen.getByRole("textbox", { name: "Recipient" }) as HTMLInputElement).value).toBe(
      ADDRESS,
    );
  });
});
