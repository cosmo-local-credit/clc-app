import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const navigate = vi.fn();

vi.mock("#/features/auth/hooks/use-storage-owner", () => ({
  useStorageOwner: () => "0xabc0000000000000000000000000000000000123",
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: { children: ReactNode }) => <a {...props}>{children}</a>,
  useRouter: () => ({ history: { back: vi.fn() } }),
  useCanGoBack: () => false,
  useNavigate: () => navigate,
}));

vi.mock("#/components/paper-wallet-scanner", () => ({
  PaperWalletScanner: ({ onKeyDecoded }: { onKeyDecoded: (value: string) => void }) => (
    <button
      type="button"
      onClick={() => onKeyDecoded("ethereum:0xa316408425cF17F1827483dee621c6C3A9B5fad4?value=1")}
    >
      Decode QR
    </button>
  ),
}));

import {
  renameAddressBookEntry,
  saveAddressBookEntry,
} from "#/features/wallet/api/address-book-storage";
import { SendRecipientPage } from "./send-recipient-page";

const OWNER = "0xabc0000000000000000000000000000000000123";

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function mockFetch(body: unknown, status = 200) {
  const fetcher = vi.fn().mockResolvedValue(createJsonResponse(body, status));
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  navigate.mockReset();
});

describe("SendRecipientPage", () => {
  it("resolves a phone number before continuing to the amount step", async () => {
    const fetcher = mockFetch({
      ok: true,
      description: "Address resolved",
      result: { address: "0xa316408425cF17F1827483dee621c6C3A9B5fad4" },
    });
    renderWithQueryClient(<SendRecipientPage token="0xtoken" />);

    fireEvent.change(screen.getByRole("textbox", { name: /recipient ens, phone or address/i }), {
      target: { value: "0711 777 734" },
    });

    expect(await screen.findByText("+254711777734")).toBeTruthy();
    expect(fetcher).toHaveBeenCalledWith(
      "https://kvviseru.v3.grassecon.net/api/v1/lookup/address/+254711777734",
      expect.objectContaining({ method: "GET" }),
    );

    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith({
        to: "/wallet/send/amount",
        search: {
          token: "0xtoken",
          recipient: "0xa316408425cF17F1827483dee621c6C3A9B5fad4",
          recipientLabel: "+254711777734",
        },
      });
    });
  });

  it("uses reverse ENS as the recipient label after resolving a phone number", async () => {
    const fetcher = vi.fn((url: string) => {
      if (url.includes("/lookup/address/")) {
        return Promise.resolve(
          createJsonResponse({
            ok: true,
            description: "Address resolved",
            result: { address: "0x5523058cdFfe5F3c1EaDADD5015E55C6E00fb439" },
          }),
        );
      }
      return Promise.resolve(
        createJsonResponse({
          ok: true,
          description: "Name reverse resolved",
          result: { name: "admin.sarafu.eth" },
        }),
      );
    });
    vi.stubGlobal("fetch", fetcher);
    renderWithQueryClient(<SendRecipientPage token="0xtoken" />);

    fireEvent.change(screen.getByRole("textbox", { name: /recipient ens, phone or address/i }), {
      target: { value: "0711 777 734" },
    });

    expect(await screen.findByText("admin.sarafu.eth")).toBeTruthy();
    expect(fetcher).toHaveBeenCalledWith(
      "https://kvviseru.v3.grassecon.net/api/v1/lookup/address/+254711777734",
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetcher).toHaveBeenCalledWith(
      "https://resolver.v3.grassecon.net/api/v1/resolve/reverse/0x5523058cdFfe5F3c1EaDADD5015E55C6E00fb439",
      expect.objectContaining({ method: "GET" }),
    );

    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith({
        to: "/wallet/send/amount",
        search: {
          token: "0xtoken",
          recipient: "0x5523058cdFfe5F3c1EaDADD5015E55C6E00fb439",
          recipientLabel: "admin.sarafu.eth",
        },
      });
    });
  });

  it("keeps pasted addresses visible in full and shows reverse ENS when present", async () => {
    const fetcher = mockFetch({
      ok: true,
      description: "Name reverse resolved",
      result: { name: "admin.sarafu.eth" },
    });
    renderWithQueryClient(<SendRecipientPage />);
    const input = screen.getByRole("textbox", { name: /recipient ens, phone or address/i });

    fireEvent.change(input, {
      target: { value: "0x5523058cdFfe5F3c1EaDADD5015E55C6E00fb439" },
    });

    expect((input as HTMLInputElement).value).toBe("0x5523058cdFfe5F3c1EaDADD5015E55C6E00fb439");
    expect(await screen.findByText("admin.sarafu.eth")).toBeTruthy();
    expect(fetcher).toHaveBeenCalledWith(
      "https://resolver.v3.grassecon.net/api/v1/resolve/reverse/0x5523058cdFfe5F3c1EaDADD5015E55C6E00fb439",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("fills the input from a scanned QR address", async () => {
    mockFetch({ name: "alice.sarafu.eth" });
    renderWithQueryClient(<SendRecipientPage />);

    fireEvent.click(screen.getByRole("button", { name: /scan qr/i }));
    fireEvent.click(screen.getByRole("button", { name: /decode qr/i }));

    expect(
      (
        screen.getByRole("textbox", {
          name: /recipient ens, phone or address/i,
        }) as HTMLInputElement
      ).value,
    ).toBe("0xa316408425cF17F1827483dee621c6C3A9B5fad4");
  });
  // The reverse-lookup gateway validates its parameter as `eth_addr_checksum`,
  // so a lowercase paste — how most explorers render an address — used to come
  // back 400 and the screen showed no name at all.
  it("checksums a lowercase pasted address before the reverse lookup", async () => {
    const fetcher = mockFetch({
      ok: true,
      description: "Name reverse resolved",
      result: { name: "admin.sarafu.eth" },
    });
    renderWithQueryClient(<SendRecipientPage />);

    fireEvent.change(screen.getByRole("textbox", { name: /recipient ens, phone or address/i }), {
      target: { value: "0x5523058cdffe5f3c1eadadd5015e55c6e00fb439" },
    });

    expect(await screen.findByText("admin.sarafu.eth")).toBeTruthy();
    expect(fetcher).toHaveBeenCalledWith(
      "https://resolver.v3.grassecon.net/api/v1/resolve/reverse/0x5523058cdFfe5F3c1EaDADD5015E55C6E00fb439",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("leaves the screen nameless rather than erroring when the resolver rejects the address", async () => {
    mockFetch({ ok: false, description: "Address validation failed" }, 400);
    renderWithQueryClient(<SendRecipientPage />);

    fireEvent.change(screen.getByRole("textbox", { name: /recipient ens, phone or address/i }), {
      target: { value: "0x5523058cdFfe5F3c1EaDADD5015E55C6E00fb439" },
    });

    expect(await screen.findByText("Address")).toBeTruthy();
    expect(screen.queryByText(/couldn't resolve that recipient/i)).toBeNull();
  });

  it("prefers a saved nickname over the resolved name when continuing", async () => {
    saveAddressBookEntry(OWNER, {
      address: "0x5523058cdFfe5F3c1EaDADD5015E55C6E00fb439",
      ensName: "admin.sarafu.eth",
      phone: null,
      source: "reverse-ens",
    });
    renameAddressBookEntry(OWNER, "0x5523058cdffe5f3c1eadadd5015e55c6e00fb439", "Mom");
    mockFetch({
      ok: true,
      description: "Name reverse resolved",
      result: { name: "admin.sarafu.eth" },
    });
    renderWithQueryClient(<SendRecipientPage token="0xtoken" />);

    fireEvent.change(screen.getByRole("textbox", { name: /recipient ens, phone or address/i }), {
      target: { value: "0x5523058cdFfe5F3c1EaDADD5015E55C6E00fb439" },
    });

    expect(await screen.findByText("Mom")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith({
        to: "/wallet/send/amount",
        search: {
          token: "0xtoken",
          recipient: "0x5523058cdFfe5F3c1EaDADD5015E55C6E00fb439",
          recipientLabel: "Mom",
        },
      });
    });
  });
});
