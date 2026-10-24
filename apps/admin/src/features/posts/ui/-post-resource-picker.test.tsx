import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const VOUCHER = "0x1111111111111111111111111111111111111111" as const;
const POOL = "0x2222222222222222222222222222222222222222" as const;

const mocks = vi.hoisted(() => ({
  voucherQuery: vi.fn(),
  poolQuery: vi.fn(),
}));

vi.mock("#/lib/api", () => ({ clcApi: { market: {}, pools: {} } }));

vi.mock("@clc/api/features/market/queries", () => ({
  voucherFilteredPageQueryOptions: (_client: unknown, params: { filter: { term: string } }) => ({
    queryKey: ["post-resource-vouchers", params.filter.term],
    queryFn: mocks.voucherQuery,
  }),
}));

vi.mock("@clc/api/features/pools/queries", () => ({
  poolFilteredPageQueryOptions: (_client: unknown, params: { filter: { term: string } }) => ({
    queryKey: ["post-resource-pools", params.filter.term],
    queryFn: mocks.poolQuery,
  }),
}));

import { PostResourcePicker } from "./post-resource-picker";

function renderPicker(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  mocks.voucherQuery.mockReset().mockResolvedValue({
    vouchers: [{ chainId: 100, address: VOUCHER, name: "Community Voucher", symbol: "COM" }],
  });
  mocks.poolQuery.mockReset().mockResolvedValue({
    pools: [{ chainId: 100, address: POOL, name: "Community Pool", symbol: "POOL" }],
  });
});

describe("PostResourcePicker", () => {
  it("searches the global voucher catalog and returns a canonical reference", async () => {
    const onChange = vi.fn();
    renderPicker(
      <PostResourcePicker
        kind="voucher"
        value={[]}
        linkedNames={new Map()}
        max={12}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByRole("combobox", { name: "Search vouchers" }), {
      target: { value: "community" },
    });
    fireEvent.click(await screen.findByRole("option", { name: /Community Voucher/ }));

    expect(onChange).toHaveBeenCalledWith([{ chainId: 100, address: VOUCHER }]);
    expect(mocks.poolQuery).not.toHaveBeenCalled();
  });

  it("searches pools independently and excludes entries without a chain", async () => {
    mocks.poolQuery.mockResolvedValue({
      pools: [
        { chainId: null, address: VOUCHER, name: "Incomplete Pool", symbol: "BAD" },
        { chainId: 100, address: POOL, name: "Community Pool", symbol: "POOL" },
      ],
    });
    const onChange = vi.fn();
    renderPicker(
      <PostResourcePicker
        kind="pool"
        value={[]}
        linkedNames={new Map()}
        max={12}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByRole("combobox", { name: "Search pools" }), {
      target: { value: "community" },
    });
    expect(await screen.findByRole("option", { name: /Community Pool/ })).toBeTruthy();
    expect(screen.queryByText("Incomplete Pool")).toBeNull();
    fireEvent.click(screen.getByRole("option", { name: /Community Pool/ }));

    expect(onChange).toHaveBeenCalledWith([{ chainId: 100, address: POOL }]);
    expect(mocks.voucherQuery).not.toHaveBeenCalled();
  });

  it("keeps a previously linked resource removable even when search cannot find it", () => {
    const onChange = vi.fn();
    renderPicker(
      <PostResourcePicker
        kind="pool"
        value={[{ chainId: 100, address: POOL }]}
        linkedNames={new Map([[`100:${POOL.toLowerCase()}`, "Previously linked pool"]])}
        max={12}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Unlink Previously linked pool" }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("shows a retry action when the selected catalog fails", async () => {
    mocks.poolQuery.mockRejectedValue(new Error("offline"));
    renderPicker(
      <PostResourcePicker
        kind="pool"
        value={[]}
        linkedNames={new Map()}
        max={12}
        onChange={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByRole("combobox", { name: "Search pools" }), {
      target: { value: "community" },
    });
    const retry = await screen.findByRole("button", { name: "Retry" });
    mocks.poolQuery.mockResolvedValue({ pools: [] });
    fireEvent.click(retry);

    await waitFor(() => expect(mocks.poolQuery).toHaveBeenCalledTimes(2));
  });
});
