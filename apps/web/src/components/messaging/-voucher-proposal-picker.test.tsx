import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  suggestions: vi.fn(),
  registry: vi.fn(),
  catalog: vi.fn(),
  search: vi.fn(),
  poolData: vi.fn(),
  retry: vi.fn(),
}));
const POOL = "0x4444444444444444444444444444444444444444";

function voucher(number: number, name: string) {
  return { address: `0x${number.toString(16).padStart(40, "0")}`, name, symbol: `V${number}` };
}

vi.mock("#/lib/api/pools", () => ({
  poolsClient: { getPoolByAddress: () => mocks.poolData() },
}));
vi.mock("#/features/pools/hooks/use-pool-registry", () => ({
  poolTokenRegistryAddress: (pool?: { tokenRegistryAddress?: string }) =>
    pool?.tokenRegistryAddress ?? null,
  usePoolRegistryTokens: mocks.registry,
}));
vi.mock("#/features/pools/hooks/use-pool-vouchers", () => ({
  usePoolVouchersWithStatus: mocks.catalog,
}));
vi.mock("#/features/catalogs/hooks/use-catalog-member-suggestions", () => ({
  useCatalogVoucherSuggestions: mocks.suggestions,
}));
vi.mock("#/features/home/hooks/use-voucher-search", () => ({
  VOUCHER_SEARCH_MIN_CHARS: 2,
  useVoucherSearch: (query: string) => mocks.search(query),
}));

import { VoucherProposalPicker } from "./voucher-proposal-picker";

function source(rows: ReturnType<typeof voucher>[]) {
  return { rows, status: "ready", completeness: "complete" };
}

function mount(value?: string, compact = false) {
  const client = new QueryClient();
  const onChange = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <VoucherProposalPicker
        poolAddress={POOL}
        value={value}
        onChange={onChange}
        compact={compact}
      />
    </QueryClientProvider>,
  );
  return onChange;
}

beforeEach(() => {
  mocks.registry.mockReset();
  mocks.catalog.mockReset();
  mocks.search.mockReset();
  mocks.poolData.mockReset();
  mocks.retry.mockReset();
  mocks.poolData.mockResolvedValue({ tokenRegistryAddress: POOL });
  mocks.registry.mockReturnValue({ data: [voucher(11, "").address] });
  mocks.catalog.mockReturnValue({ vouchers: [], isPending: false, isError: false });
  mocks.search.mockImplementation((query: string) => ({
    status: query.length >= 2 ? "ready" : "idle",
    results:
      query === "garden" ? [voucher(10, "Garden voucher"), voucher(20, "Garden network")] : [],
  }));
  mocks.suggestions.mockReturnValue({
    owned: source([
      voucher(10, "Garden voucher"),
      ...[1, 2, 3, 4, 5].map((id) => voucher(id, `Owned ${id}`)),
    ]),
    holdings: source([
      { ...voucher(10, "Duplicate holding"), address: voucher(10, "").address.toUpperCase() },
      voucher(11, "Already accepted"),
      voucher(12, "Holding"),
    ]),
  });
});

describe("Voucher proposal choices", () => {
  it("expands the compact trigger before loading choices", async () => {
    mount(undefined, true);
    expect(screen.queryByRole("textbox", { name: "Search vouchers" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Propose a voucher" }));
    expect(await screen.findByRole("textbox", { name: "Search vouchers" })).toBeTruthy();
  });

  it("puts all eligible owned and held vouchers in one bounded list and searches them", async () => {
    const onChange = mount(voucher(10, "").address);
    const list = await screen.findByRole("list", { name: "Voucher choices" });
    expect(list.classList.contains("max-h-45")).toBe(true);
    const names = within(list)
      .getAllByRole("button")
      .map((button) => button.textContent);
    expect(names).toEqual([
      "Garden voucherV10",
      "Owned 1V1",
      "Owned 2V2",
      "Owned 3V3",
      "Owned 4V4",
      "Owned 5V5",
      "HoldingV12",
    ]);

    fireEvent.change(screen.getByRole("textbox", { name: "Search vouchers" }), {
      target: { value: "garden" },
    });
    expect(
      within(list)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Garden voucherV10", "Garden networkV20"]);
    expect(
      within(list)
        .getByRole("button", { name: /Garden voucher/ })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.click(within(list).getByRole("button", { name: /Garden network/ }));
    expect(onChange).toHaveBeenCalledWith(voucher(20, "").address);
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onChange).toHaveBeenLastCalledWith();
  });

  it("offers Retry instead of treating an unknown membership list as empty", async () => {
    mocks.registry.mockReturnValue({ isError: true, refetch: mocks.retry });
    mount();
    await screen.findByText("Couldn't check which vouchers the pool accepts.");
    expect(screen.queryByRole("list")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.retry).toHaveBeenCalledOnce();
  });

  it("uses the legacy catalog when the Pool has no registry", async () => {
    mocks.poolData.mockResolvedValue({ tokenRegistryAddress: null });
    mocks.catalog.mockReturnValue({
      vouchers: [{ tokenAddress: voucher(10, "").address }],
      isPending: false,
      isError: false,
    });
    mount();
    const list = await screen.findByRole("list", { name: "Voucher choices" });
    expect(within(list).queryByText("Garden voucher")).toBeNull();
    expect(within(list).getByText("Holding")).toBeTruthy();
  });

  it("retries a failed legacy catalog membership read", async () => {
    mocks.poolData.mockResolvedValue({ tokenRegistryAddress: null });
    mocks.catalog.mockReturnValue({
      vouchers: [],
      isPending: false,
      isError: true,
      isFetching: false,
      refetch: mocks.retry,
    });
    mount();
    await screen.findByText("Couldn't check which vouchers the pool accepts.");
    await waitFor(() =>
      expect(mocks.catalog).toHaveBeenLastCalledWith(
        expect.objectContaining({ tokenRegistryAddress: null }),
        { all: true },
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.retry).toHaveBeenCalledOnce();
  });

  it("reports partial wallet suggestions and retries every incomplete source", async () => {
    const ownedRetry = vi.fn();
    const holdingsRetry = vi.fn();
    mocks.suggestions.mockReturnValue({
      owned: {
        rows: [],
        status: "error",
        completeness: "partial",
        retrying: false,
        retry: ownedRetry,
      },
      holdings: {
        rows: [],
        status: "ready",
        completeness: "partial",
        retrying: false,
        retry: holdingsRetry,
      },
    });
    mount();
    await screen.findByText("Some wallet vouchers couldn't be loaded.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(ownedRetry).toHaveBeenCalledOnce();
    expect(holdingsRetry).toHaveBeenCalledOnce();
  });

  it("shows wallet loading, short-query, searching, error, and empty states", async () => {
    mocks.suggestions.mockReturnValue({
      owned: { rows: [], status: "loading", completeness: "complete" },
      holdings: source([]),
    });
    const { rerender } = render(
      <QueryClientProvider client={new QueryClient()}>
        <VoucherProposalPicker poolAddress={POOL} onChange={vi.fn()} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Loading vouchers…")).toBeTruthy();

    mocks.suggestions.mockReturnValue({ owned: source([]), holdings: source([]) });
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <VoucherProposalPicker poolAddress={POOL} onChange={vi.fn()} />
      </QueryClientProvider>,
    );
    const input = await screen.findByRole("textbox", { name: "Search vouchers" });
    fireEvent.change(input, { target: { value: "g" } });
    expect(screen.getByText("Enter at least two characters.")).toBeTruthy();
    const enter = new KeyboardEvent("keydown", { key: "Enter", cancelable: true, bubbles: true });
    input.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(true);

    mocks.search.mockReturnValue({ status: "searching", results: [] });
    fireEvent.change(input, { target: { value: "go" } });
    expect(screen.getByText("Searching…")).toBeTruthy();

    const searchRetry = vi.fn();
    mocks.search.mockReturnValue({
      status: "error",
      results: [],
      retrying: false,
      retry: searchRetry,
    });
    fireEvent.change(input, { target: { value: "gone" } });
    expect(screen.getByText("Couldn't search. Try again.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(searchRetry).toHaveBeenCalledOnce();

    mocks.search.mockReturnValue({ status: "ready", results: [] });
    fireEvent.change(input, { target: { value: "missing" } });
    expect(screen.getByText("No matching vouchers.")).toBeTruthy();
  });
});
