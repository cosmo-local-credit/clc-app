import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { CatalogMemberCandidate } from "../logic/catalog-member-candidates";
import type { CatalogSuggestionSource } from "../hooks/use-catalog-member-suggestions";
import { CatalogMemberPicker } from "./catalog-member-picker";

const mocks = vi.hoisted(() => ({
  api: {
    members: vi.fn(),
    setMember: vi.fn(),
  },
  success: vi.fn(),
  error: vi.fn(),
  voucherSearchResults: [] as CatalogMemberCandidate[],
  poolSearchResults: [] as CatalogMemberCandidate[],
  voucherSearchStatus: "ready" as "searching" | "ready" | "error",
  poolSearchStatus: "ready" as "searching" | "ready" | "error",
  retryVoucherSearch: vi.fn(),
  retryPoolSearch: vi.fn(),
  voucherSuggestions: {
    holdings: {
      rows: [] as CatalogMemberCandidate[],
      status: "ready" as CatalogSuggestionSource["status"],
      completeness: "complete" as CatalogSuggestionSource["completeness"],
      retry: vi.fn(),
      retrying: false,
    } as CatalogSuggestionSource,
    owned: {
      rows: [] as CatalogMemberCandidate[],
      status: "ready" as CatalogSuggestionSource["status"],
      completeness: "complete" as CatalogSuggestionSource["completeness"],
      retry: vi.fn(),
      retrying: false,
    } as CatalogSuggestionSource,
  },
  poolSuggestions: {
    owned: {
      rows: [] as CatalogMemberCandidate[],
      status: "ready" as CatalogSuggestionSource["status"],
      completeness: "complete" as CatalogSuggestionSource["completeness"],
      retry: vi.fn(),
      retrying: false,
    } as CatalogSuggestionSource,
    accepting: {
      rows: [] as CatalogMemberCandidate[],
      status: "ready" as CatalogSuggestionSource["status"],
      completeness: "complete" as CatalogSuggestionSource["completeness"],
      retry: vi.fn(),
      retrying: false,
    } as CatalogSuggestionSource,
  },
}));

function source(rows: CatalogMemberCandidate[] = []): CatalogSuggestionSource {
  return {
    rows,
    status: "ready" as const,
    completeness: "complete" as const,
    retry: vi.fn(),
    retrying: false,
  };
}

vi.mock("#/lib/api/catalogs", () => ({ catalogsClient: mocks.api }));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({
    isAuthenticated: true,
    isLoading: false,
    session: { address: `0x${"f".repeat(40)}` },
  }),
}));
vi.mock("#/features/catalogs/hooks/use-catalog-member-suggestions", () => ({
  useCatalogVoucherSuggestions: () => mocks.voucherSuggestions,
  useCatalogPoolSuggestions: () => mocks.poolSuggestions,
}));
vi.mock("#/features/home/hooks/use-voucher-search", () => ({
  VOUCHER_SEARCH_MIN_CHARS: 2,
  useVoucherSearch: (query: string, setQuery: (next: string) => void) => ({
    query,
    setQuery,
    results: query.trim().length >= 2 ? mocks.voucherSearchResults : [],
    status: query.trim().length >= 2 ? mocks.voucherSearchStatus : "idle",
    retry: mocks.retryVoucherSearch,
    retrying: false,
  }),
}));
vi.mock("#/features/catalogs/hooks/use-pool-search", () => ({
  POOL_SEARCH_MIN_CHARS: 2,
  usePoolSearch: (query: string, setQuery: (next: string) => void) => ({
    query,
    setQuery,
    results: query.trim().length >= 2 ? mocks.poolSearchResults : [],
    status: query.trim().length >= 2 ? mocks.poolSearchStatus : "idle",
    retry: mocks.retryPoolSearch,
    retrying: false,
  }),
}));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));

const ADDRESS_A = `0x${"a".repeat(40)}` as const;
const ADDRESS_B = `0x${"b".repeat(40)}` as const;
const ADDRESS_C = `0x${"c".repeat(40)}` as const;
const ADDRESS_D = `0x${"d".repeat(40)}` as const;

function candidate(
  id: string,
  address: `0x${string}`,
  name: string,
  symbol: string,
): CatalogMemberCandidate {
  return { id, chainId: 100, address, name, symbol, imageUrl: null };
}

function mount(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.voucherSearchResults = [];
  mocks.poolSearchResults = [];
  mocks.voucherSearchStatus = "ready";
  mocks.poolSearchStatus = "ready";
  mocks.voucherSuggestions.holdings = source();
  mocks.voucherSuggestions.owned = source();
  mocks.poolSuggestions.owned = source();
  mocks.poolSuggestions.accepting = source();
  mocks.api.members.mockResolvedValue({ items: [], nextCursor: null });
  mocks.api.setMember.mockResolvedValue({ added: true });
});

describe("catalog member picker", () => {
  it("drains membership, removes later-page members, and preserves suggestion priority", async () => {
    mocks.api.members.mockImplementation((_id, _kind, cursor) =>
      Promise.resolve(
        cursor
          ? {
              items: [
                {
                  id: "2",
                  chainId: 100,
                  address: ADDRESS_B,
                  name: "Already added",
                  imageUrl: null,
                },
              ],
              nextCursor: null,
            }
          : {
              items: [
                { id: "1", chainId: 100, address: ADDRESS_A, name: "First member", imageUrl: null },
              ],
              nextCursor: "later",
            },
      ),
    );
    const preferred = candidate("3", ADDRESS_C, "Owned pool", "OWN");
    mocks.poolSuggestions.owned = source([
      candidate("2", ADDRESS_B, "Already added", "OLD"),
      preferred,
    ]);
    mocks.poolSuggestions.accepting = source([
      candidate("30", ADDRESS_C, "Duplicate pool", "DUP"),
      candidate("4", ADDRESS_D, "Matching pool", "MAT"),
    ]);
    const onOpenChange = vi.fn();

    mount(<CatalogMemberPicker catalogId="7" kind="pool" open onOpenChange={onOpenChange} />);

    const dialog = await screen.findByRole("dialog", { name: "Add a pool" });
    await waitFor(() =>
      expect(mocks.api.members).toHaveBeenCalledWith("7", "pool", "later", expect.anything()),
    );
    await within(dialog).findByRole("button", { name: /Owned pool/ });
    expect(within(dialog).queryByRole("button", { name: /Already added/ })).toBeNull();
    expect(within(dialog).getAllByRole("button", { name: /Owned pool/ })).toHaveLength(1);
    expect(within(dialog).queryByRole("button", { name: /Duplicate pool/ })).toBeNull();
    expect(within(dialog).getByRole("button", { name: /Matching pool/ })).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: /Owned pool/ }));
    await waitFor(() =>
      expect(mocks.api.setMember).toHaveBeenCalledWith("7", "pool", preferred.id, true),
    );
    expect(mocks.success).toHaveBeenCalledWith("Added to catalog");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("searches globally and excludes current members from results", async () => {
    mocks.api.members.mockResolvedValue({
      items: [{ id: "5", chainId: 100, address: ADDRESS_A, name: "Existing", imageUrl: null }],
      nextCursor: null,
    });
    mocks.poolSearchResults = [
      candidate("5", ADDRESS_A, "Existing", "OLD"),
      candidate("6", ADDRESS_B, "Bicycle pool", "BIKE"),
    ];

    mount(<CatalogMemberPicker catalogId="7" kind="pool" open onOpenChange={vi.fn()} />);
    const dialog = await screen.findByRole("dialog", { name: "Add a pool" });
    fireEvent.change(await within(dialog).findByRole("searchbox", { name: "Search pools" }), {
      target: { value: "bike" },
    });

    expect(within(dialog).queryByRole("button", { name: /Existing/ })).toBeNull();
    expect(within(dialog).getByRole("button", { name: /Bicycle pool/ })).toBeTruthy();
  });

  it("normalizes voucher search results into direct candidates", async () => {
    mocks.voucherSearchResults = [candidate("6", ADDRESS_B, "Bicycle voucher", "BIKE")];

    mount(<CatalogMemberPicker catalogId="7" kind="voucher" open onOpenChange={vi.fn()} />);
    const dialog = await screen.findByRole("dialog", { name: "Add a voucher" });
    fireEvent.change(await within(dialog).findByRole("searchbox", { name: "Search vouchers" }), {
      target: { value: "bike" },
    });

    expect(within(dialog).getByRole("button", { name: /Bicycle voucher/ })).toBeTruthy();
  });

  it("shows minimum-length, searching, error, retry, and empty search states", async () => {
    let view = mount(<CatalogMemberPicker catalogId="7" kind="pool" open onOpenChange={vi.fn()} />);
    let dialog = await screen.findByRole("dialog", { name: "Add a pool" });
    const search = await within(dialog).findByRole("searchbox", { name: "Search pools" });
    fireEvent.change(search, { target: { value: "b" } });
    expect(within(dialog).getByText("Type at least two characters.")).toBeTruthy();

    mocks.poolSearchStatus = "searching";
    fireEvent.change(search, { target: { value: "bike" } });
    expect(within(dialog).getByText("Searching…")).toBeTruthy();

    view.unmount();
    mocks.poolSearchStatus = "error";
    view = mount(<CatalogMemberPicker catalogId="7" kind="pool" open onOpenChange={vi.fn()} />);
    dialog = await screen.findByRole("dialog", { name: "Add a pool" });
    fireEvent.change(await within(dialog).findByRole("searchbox", { name: "Search pools" }), {
      target: { value: "bike" },
    });
    expect(within(dialog).getByRole("alert").textContent).toContain("Couldn't search pools.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Retry" }));
    expect(mocks.retryPoolSearch).toHaveBeenCalledOnce();

    view.unmount();
    mocks.poolSearchStatus = "ready";
    mount(<CatalogMemberPicker catalogId="7" kind="pool" open onOpenChange={vi.fn()} />);
    dialog = await screen.findByRole("dialog", { name: "Add a pool" });
    fireEvent.change(await within(dialog).findByRole("searchbox", { name: "Search pools" }), {
      target: { value: "none" },
    });
    expect(within(dialog).getByText("No pools match this search.")).toBeTruthy();
  });

  it("keeps the voucher picker open after an add failure", async () => {
    mocks.voucherSuggestions.holdings = source([candidate("8", ADDRESS_C, "Food voucher", "FOOD")]);
    mocks.api.setMember.mockRejectedValueOnce(new Error("offline"));
    const onOpenChange = vi.fn();

    mount(<CatalogMemberPicker catalogId="7" kind="voucher" open onOpenChange={onOpenChange} />);
    const dialog = await screen.findByRole("dialog", { name: "Add a voucher" });
    fireEvent.click(await within(dialog).findByRole("button", { name: /Food voucher/ }));

    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith("Couldn't update the catalog. Try again."),
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(within(dialog).getByRole("button", { name: /Food voucher/ })).toBeTruthy();
  });

  it("keeps successful fallback suggestions when another source fails", async () => {
    const retryHoldings = vi.fn();
    const retryOwned = vi.fn();
    mocks.voucherSuggestions.holdings = {
      ...source([candidate("8", ADDRESS_C, "Recent voucher", "REC")]),
      completeness: "partial",
      retry: retryHoldings,
    };
    mocks.voucherSuggestions.owned = {
      ...source(),
      status: "error",
      retry: retryOwned,
    };

    mount(<CatalogMemberPicker catalogId="7" kind="voucher" open onOpenChange={vi.fn()} />);
    const dialog = await screen.findByRole("dialog", { name: "Add a voucher" });
    const holdings = await within(dialog).findByRole("region", { name: "Vouchers you hold" });
    const owned = within(dialog).getByRole("region", { name: "My Vouchers" });

    expect(within(holdings).getByText("Recent voucher")).toBeTruthy();
    expect(within(holdings).getByText("Showing recent vouchers only.")).toBeTruthy();
    expect(within(owned).getByText("Unavailable")).toBeTruthy();
    fireEvent.click(within(holdings).getByRole("button", { name: "Retry" }));
    fireEvent.click(within(owned).getByRole("button", { name: "Retry" }));
    expect(retryHoldings).toHaveBeenCalledTimes(1);
    expect(retryOwned).toHaveBeenCalledTimes(1);
  });

  it("blocks candidates when complete membership cannot be verified and retries", async () => {
    mocks.poolSuggestions.owned = source([candidate("9", ADDRESS_D, "Hidden candidate", "HID")]);
    mocks.api.members
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ items: [], nextCursor: null });

    mount(<CatalogMemberPicker catalogId="7" kind="pool" open onOpenChange={vi.fn()} />);
    const dialog = await screen.findByRole("dialog", { name: "Add a pool" });
    expect(await within(dialog).findByRole("alert")).toHaveProperty(
      "textContent",
      "Couldn't load catalog items.",
    );
    expect(within(dialog).queryByText("Hidden candidate")).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: "Retry" }));
    expect(await within(dialog).findByText("Hidden candidate")).toBeTruthy();
  });
});
