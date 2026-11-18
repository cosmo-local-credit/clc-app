import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({ suggestions: vi.fn(), registry: vi.fn(), retry: vi.fn() }));
const POOL = "0x4444444444444444444444444444444444444444";

function voucher(number: number, name: string) {
  return { address: `0x${number.toString(16).padStart(40, "0")}`, name, symbol: `V${number}` };
}

vi.mock("#/lib/api/pools", () => ({
  poolsClient: { getPoolByAddress: async () => ({ tokenRegistryAddress: POOL }) },
}));
vi.mock("#/features/pools/hooks/use-pool-registry", () => ({
  poolTokenRegistryAddress: (pool?: { tokenRegistryAddress?: string }) =>
    pool?.tokenRegistryAddress ?? null,
  usePoolRegistryTokens: mocks.registry,
}));
vi.mock("#/features/pools/hooks/use-pool-vouchers", () => ({
  usePoolVouchersWithStatus: () => ({ vouchers: [] }),
}));
vi.mock("#/features/catalogs/hooks/use-catalog-member-suggestions", () => ({
  useCatalogVoucherSuggestions: mocks.suggestions,
}));
vi.mock("#/features/home/hooks/use-voucher-search", () => ({
  VOUCHER_SEARCH_MIN_CHARS: 2,
  useVoucherSearch: (query: string) => ({
    status: query.length >= 2 ? "ready" : "idle",
    results:
      query === "garden" ? [voucher(10, "Garden voucher"), voucher(20, "Garden network")] : [],
  }),
}));

import { VoucherProposalPicker } from "./voucher-proposal-picker";

function source(rows: ReturnType<typeof voucher>[]) {
  return { rows, status: "ready", completeness: "complete" };
}

function mount(value?: string) {
  const client = new QueryClient();
  const onChange = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <VoucherProposalPicker poolAddress={POOL} value={value} onChange={onChange} />
    </QueryClientProvider>,
  );
  return onChange;
}

beforeEach(() => {
  mocks.registry.mockReset();
  mocks.retry.mockReset();
  mocks.registry.mockReturnValue({ data: [voucher(11, "").address] });
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
});
