import { CHAIN_ID } from "#/lib/chain";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { getAddress } from "viem";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const navigate = vi.fn();
const { storageOwner } = vi.hoisted(() => ({
  storageOwner: { current: "0xabc0000000000000000000000000000000000123" },
}));

vi.mock("#/features/auth/hooks/use-storage-owner", () => ({
  useStorageOwner: () => storageOwner.current,
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
  readAddressBookRecipients,
  upsertAddressBookRecipient,
} from "#/features/wallet/api/address-book-storage";
import { GUEST_STORAGE_OWNER } from "#/lib/storage/owner-tier-key";
import { SendRecipientPage } from "./send-recipient-page";

const OWNER = "0xabc0000000000000000000000000000000000123";
const AMINA = "0x1111000000000000000000000000000000000001" as const;
const JOSH = "0x2222000000000000000000000000000000000002" as const;

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function mockFetch(body: unknown, status = 200) {
  // A Response body can be read once. Transfers and recipient lookup both
  // fetch, so each call needs its own response.
  const fetcher = vi
    .fn()
    .mockImplementation(() => Promise.resolve(createJsonResponse(body, status)));
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
  it("loads recent activity and searches short names after the debounce", async () => {
    const fetcher = vi.fn((url: string) => {
      if (url.includes("/transfers")) {
        return Promise.resolve(
          createJsonResponse({ ok: false, description: "activity unavailable" }, 500),
        );
      }
      return Promise.resolve(
        createJsonResponse({ ok: false, description: "recipient unavailable" }, 500),
      );
    });
    vi.stubGlobal("fetch", fetcher);
    renderWithQueryClient(<SendRecipientPage />);
    const input = screen.getByRole("textbox", { name: /recipient username/i });

    expect(await screen.findByText("Couldn't load activity.")).toBeTruthy();
    expect(
      fetcher.mock.calls.some(([url]) =>
        String(url).includes(`/api/v2/accounts/${getAddress(OWNER)}/transfers`),
      ),
    ).toBe(true);
    expect(screen.queryByRole("button", { name: "Recent recipients" })).toBeNull();

    for (const value of ["a", "ab"]) {
      fireEvent.change(input, { target: { value } });
      await act(() => new Promise((resolve) => setTimeout(resolve, 300)));
      expect(screen.queryByText("Couldn't load activity.")).toBeNull();
      expect(screen.queryByText("Loading activity…")).toBeNull();
      expect(await screen.findByText("Couldn't resolve that recipient.")).toBeTruthy();
      expect(
        fetcher.mock.calls.some(([url]) => new URL(String(url)).searchParams.get("q") === value),
      ).toBe(true);
    }

    fireEvent.change(input, { target: { value: "abc" } });
    expect(await screen.findByText("Couldn't resolve that recipient.")).toBeTruthy();
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes("/recipients?"))).toHaveLength(
      3,
    );

    fireEvent.change(input, { target: { value: "" } });
    expect(await screen.findByText("Couldn't load activity.")).toBeTruthy();
  });

  it("selects a pool display-name result and saves its concrete address", async () => {
    const fetcher = vi.fn((url: string) => {
      if (url.includes("/recipients?")) {
        const query = new URL(url).searchParams;
        expect(query.get("q")).toBe("Will's Pool");
        expect(query.has("kind")).toBe(false);
        return Promise.resolve(
          createJsonResponse({
            ok: true,
            result: {
              recipients: [
                {
                  kind: "pool",
                  name: "Will's Pool",
                  alias: "Will's Pool",
                  address: JOSH,
                  chainId: CHAIN_ID,
                },
              ],
            },
          }),
        );
      }
      return Promise.resolve(createJsonResponse({ ok: true, result: { transfers: [], last: 0 } }));
    });
    vi.stubGlobal("fetch", fetcher);
    renderWithQueryClient(<SendRecipientPage token="0xtoken" />);
    fireEvent.change(screen.getByRole("textbox", { name: /recipient username/i }), {
      target: { value: "Will's Pool" },
    });
    expect(screen.getByRole("button", { name: /continue/i }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(await screen.findByRole("button", { name: /Will's Pool/ }));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({
        to: "/wallet/send/amount",
        search: { token: "0xtoken", recipient: JOSH, recipientLabel: "Will's Pool" },
      }),
    );
    expect(readAddressBookRecipients(OWNER)).toEqual([
      expect.objectContaining({ address: JOSH, label: "Will's Pool", source: "alias" }),
    ]);
    expect(fetcher.mock.calls.some(([url]) => /ens|\.eth/.test(url))).toBe(false);
  });

  it("keeps a renamed saved contact at its original address", async () => {
    upsertAddressBookRecipient(OWNER, { label: "old-name", address: AMINA, source: "alias" });
    const fetcher = vi.fn((url: string) => {
      if (url.includes("/recipients/reverse/")) {
        expect(url.toLowerCase()).toContain(AMINA);
        return Promise.resolve(
          createJsonResponse({
            ok: true,
            result: {
              recipient: {
                kind: "user",
                name: "Amina",
                alias: "new-name",
                address: AMINA,
                chainId: CHAIN_ID,
              },
            },
          }),
        );
      }
      return Promise.resolve(
        createJsonResponse({
          ok: true,
          result: {
            transfers: [transfer(AMINA, "2026-10-01T00:00:00Z")],
            last: 1,
          },
        }),
      );
    });
    vi.stubGlobal("fetch", fetcher);
    renderWithQueryClient(<SendRecipientPage token="0xtoken" />);
    fireEvent.click(await screen.findByRole("button", { name: /new-name/ }));
    await waitFor(() => expect(screen.getByText("new-name")).toBeTruthy());
    expect(screen.queryByText("Amina")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({
        to: "/wallet/send/amount",
        search: { token: "0xtoken", recipient: AMINA, recipientLabel: "new-name" },
      }),
    );
    expect(fetcher.mock.calls.some(([url]) => url.includes("old-name"))).toBe(false);
    expect(readAddressBookRecipients(OWNER)[0]?.address).toBe(AMINA);
  });

  it("falls back to a saved label when the address has no current backend identity", async () => {
    upsertAddressBookRecipient(OWNER, { label: "Saved Amina", address: AMINA, source: "alias" });
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("/recipients/reverse/")) {
          return Promise.resolve(createJsonResponse({ ok: false, description: "not found" }, 404));
        }
        return Promise.resolve(
          createJsonResponse({
            ok: true,
            result: {
              transfers: [transfer(AMINA, "2026-10-01T00:00:00Z")],
              last: 1,
            },
          }),
        );
      }),
    );
    renderWithQueryClient(<SendRecipientPage token="0xtoken" />);

    fireEvent.click(await screen.findByRole("button", { name: /Saved Amina/ }));
    await waitFor(() => expect(screen.getByText("Saved Amina")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({
        to: "/wallet/send/amount",
        search: { token: "0xtoken", recipient: AMINA, recipientLabel: "Saved Amina" },
      }),
    );
  });

  it.each(["0711 777 734", "+387 (61) 123-456"])(
    "selects a Core phone match for %s before continuing",
    async (phone) => {
      const fetcher = mockFetch({
        ok: true,
        result: {
          recipients: [
            { kind: "user", name: "Amina", alias: "amina", address: AMINA, chainId: CHAIN_ID },
          ],
        },
      });
      renderWithQueryClient(<SendRecipientPage token="0xtoken" />);
      const input = screen.getByRole("textbox", { name: /recipient username/i });
      fireEvent.change(input, { target: { value: phone } });

      const match = await screen.findByRole("button", { name: /amina/ });
      expect(screen.getByRole("button", { name: /continue/i }).hasAttribute("disabled")).toBe(true);
      const recipientCalls = fetcher.mock.calls.filter(([url]) =>
        String(url).includes("/recipients?"),
      );
      expect(recipientCalls).toHaveLength(1);
      const url = new URL(String(recipientCalls[0]?.[0]));
      expect(url.pathname).toBe("/api/v2/recipients");
      // Core normalizes phone punctuation; the client preserves the entered query.
      expect(url.searchParams.get("q")).toBe(phone);

      fireEvent.click(match);
      fireEvent.click(screen.getByRole("button", { name: /continue/i }));
      await waitFor(() =>
        expect(navigate).toHaveBeenCalledWith({
          to: "/wallet/send/amount",
          search: { token: "0xtoken", recipient: AMINA, recipientLabel: "amina" },
        }),
      );
      expect(readAddressBookRecipients(OWNER)).toEqual([
        expect.objectContaining({ address: AMINA, label: "amina", source: "phone" }),
      ]);
    },
  );

  it("does not resolve a partial phone number", async () => {
    const fetcher = mockFetch({ ok: true, result: { recipients: [] } });
    renderWithQueryClient(<SendRecipientPage token="0xtoken" />);

    fireEvent.change(screen.getByRole("textbox", { name: /recipient username/i }), {
      target: { value: "071" },
    });

    expect(await screen.findByText("No matching recipients.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /continue/i }).hasAttribute("disabled")).toBe(true);
    expect(fetcher.mock.calls.some(([url]) => String(url).includes("q=071"))).toBe(true);
  });

  it("keeps pasted addresses visible in full and shows current username when present", async () => {
    const fetcher = mockFetch({
      ok: true,
      description: "Name reverse resolved",
      result: {
        recipient: {
          kind: "user",
          name: "admin",
          alias: "admin",
          address: "0x5523058cdFfe5F3c1EaDADD5015E55C6E00fb439",
          chainId: CHAIN_ID,
        },
      },
    });
    renderWithQueryClient(<SendRecipientPage />);
    const input = screen.getByRole("textbox", {
      name: /recipient username, pool name, phone or address/i,
    });

    fireEvent.change(input, {
      target: { value: "0x5523058cdFfe5F3c1EaDADD5015E55C6E00fb439" },
    });

    expect((input as HTMLInputElement).value).toBe("0x5523058cdFfe5F3c1EaDADD5015E55C6E00fb439");
    expect(await screen.findByText("admin")).toBeTruthy();
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining(
        "/api/v2/recipients/reverse/0x5523058cdFfe5F3c1EaDADD5015E55C6E00fb439",
      ),
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("fills the input from a scanned QR address", async () => {
    mockFetch({ name: "alice" });
    renderWithQueryClient(<SendRecipientPage />);

    fireEvent.click(screen.getByRole("button", { name: /scan qr/i }));
    fireEvent.click(screen.getByRole("button", { name: /decode qr/i }));

    expect(
      (
        screen.getByRole("textbox", {
          name: /recipient username, pool name, phone or address/i,
        }) as HTMLInputElement
      ).value,
    ).toBe("0xa316408425cF17F1827483dee621c6C3A9B5fad4");
  });

  it("does not wait on activity a guest cannot have", async () => {
    storageOwner.current = GUEST_STORAGE_OWNER;
    const fetcher = vi.fn((_url: string) =>
      Promise.resolve(createJsonResponse({ ok: true, result: {} })),
    );
    vi.stubGlobal("fetch", fetcher);
    try {
      renderWithQueryClient(<SendRecipientPage token="0xtoken" />);

      await screen.findByRole("textbox", {
        name: /recipient username, pool name, phone or address/i,
      });
      expect(screen.queryByText("Loading activity…")).toBeNull();
      expect(screen.queryByRole("region", { name: "Recent recipients" })).toBeNull();
      expect(fetcher.mock.calls.some(([url]) => String(url).includes("/transfers"))).toBe(false);
    } finally {
      storageOwner.current = OWNER;
    }
  });

  it("selects a recent person paid from activity", async () => {
    upsertAddressBookRecipient(OWNER, { label: "Amina", address: AMINA, source: "manual" });
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (!String(url).includes("/transfers")) {
          return Promise.resolve(createJsonResponse({ ok: true, result: {} }));
        }
        return Promise.resolve(
          createJsonResponse({
            ok: true,
            result: {
              transfers: [
                transfer(JOSH, "2026-07-02T00:00:00Z"),
                transfer(AMINA, "2026-07-03T00:00:00Z"),
                transfer(AMINA, "2026-07-01T00:00:00Z"),
                transfer(JOSH, "2026-07-04T00:00:00Z", "IN"),
                transfer(JOSH, "2026-07-05T00:00:00Z", "OUT", false),
              ],
              last: 5,
            },
          }),
        );
      }),
    );
    renderWithQueryClient(<SendRecipientPage token="0xtoken" />);

    const recent = await screen.findByRole("region", { name: "Recent recipients" });
    expect(await within(recent).findByRole("button", { name: /Address/ })).toBeTruthy();
    expect(recent.textContent?.indexOf("Amina")).toBeLessThan(
      recent.textContent?.indexOf("0x2222") ?? -1,
    );
    expect(within(recent).getAllByRole("button")).toHaveLength(2);

    fireEvent.click(within(recent).getByRole("button", { name: /Amina/ }));
    expect(screen.queryByRole("region", { name: "Recent recipients" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith({
        to: "/wallet/send/amount",
        search: {
          token: "0xtoken",
          recipient: AMINA,
          recipientLabel: "Amina",
        },
      });
    });
  });
});

function transfer(
  recipientAddress: string,
  dateBlock: string,
  direction: "IN" | "OUT" = "OUT",
  success = true,
) {
  return {
    id: dateBlock,
    txHash: `0x${"ab".repeat(32)}`,
    dateBlock,
    direction,
    counterpartyAddress: recipientAddress,
    senderAddress: OWNER,
    recipientAddress,
    tokenAddress: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
    tokenSymbol: "WLLR",
    tokenName: "Will",
    tokenDecimals: 6,
    amount: "1",
    success,
    hasNote: false,
  };
}
