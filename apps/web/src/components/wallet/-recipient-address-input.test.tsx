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

  it("resolves ENS names into a contract-ready recipient address", async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ result: { address: ADDRESS } }));
    vi.stubGlobal("fetch", fetcher);
    const onRecipientChange = renderInput();

    fireEvent.change(screen.getByRole("textbox", { name: "Recipient" }), {
      target: { value: "alice.sarafu.eth" },
    });

    await waitFor(() =>
      expect(onRecipientChange).toHaveBeenLastCalledWith({
        address: ADDRESS,
        name: "alice.sarafu.eth",
        source: "ens",
      }),
    );
    expect(fetcher).toHaveBeenCalledWith(
      "https://resolver.v3.grassecon.net/api/v1/resolve/alice.sarafu.eth",
      expect.objectContaining({ method: "GET" }),
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
