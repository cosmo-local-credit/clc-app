import { CHAIN_ID } from "#/lib/chain";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  it("searches only with three trimmed characters and hides results when shortened or cleared", async () => {
    const fetcher = vi.fn((_url: string) =>
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
    renderInput();
    const input = screen.getByRole("textbox", { name: "Recipient" });

    for (const value of ["", "a", "al", "  al  "]) {
      fireEvent.change(input, { target: { value } });
      await act(() => new Promise((resolve) => setTimeout(resolve, 300)));
      expect(fetcher).not.toHaveBeenCalled();
      expect(screen.queryByText("Searching recipients…")).toBeNull();
      expect(screen.queryByText("No matching recipients.")).toBeNull();
    }

    fireEvent.change(input, { target: { value: "  ali  " } });
    expect(await screen.findByRole("button", { name: /Alice \(alice\)/ })).toBeTruthy();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(new URL(String(fetcher.mock.calls[0]?.[0])).searchParams.get("q")).toBe("ali");

    for (const value of ["al", ""]) {
      fireEvent.change(input, { target: { value } });
      expect(screen.queryByRole("list", { name: "Matching recipients" })).toBeNull();
      await act(() => new Promise((resolve) => setTimeout(resolve, 300)));
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(screen.queryByText("Searching recipients…")).toBeNull();
    }
  });

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

  it("filters other chains and keeps duplicate display names as distinct selections", async () => {
    const secondAddress = "0xb316408425cF17F1827483dee621c6C3A9B5fad4";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        json({
          ok: true,
          result: {
            recipients: [
              { kind: "user", name: "Alex", alias: "alex", address: ADDRESS, chainId: CHAIN_ID },
              {
                kind: "user",
                name: "Alex",
                alias: "alex",
                address: secondAddress,
                chainId: CHAIN_ID,
              },
              {
                kind: "user",
                name: "Alex",
                alias: "alex",
                address: "0xc316408425cF17F1827483dee621c6C3A9B5fad4",
                chainId: 1,
              },
            ],
          },
        }),
      ),
    );
    const onRecipientChange = renderInput();

    fireEvent.change(screen.getByRole("textbox", { name: "Recipient" }), {
      target: { value: "alex" },
    });
    const matches = await screen.findAllByRole("button", { name: /Alex \(alex\)/ });
    expect(matches).toHaveLength(2);
    expect(matches[0].textContent).toContain("0xa316…5fad4");
    expect(matches[1].textContent).toContain("0xb316…5fad4");
    fireEvent.click(matches[1]);

    await waitFor(() =>
      expect(onRecipientChange).toHaveBeenLastCalledWith({
        address: secondAddress,
        name: "Alex (alex)",
        source: "alias",
      }),
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
