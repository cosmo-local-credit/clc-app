import type { MarketVoucherDetail } from "@clc/api/features/market/client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const OWNER = "0x1000000000000000000000000000000000000001" as const;
const WRITER = "0x2000000000000000000000000000000000000002" as const;

const state = vi.hoisted(() => ({
  operator: "0x1000000000000000000000000000000000000001" as `0x${string}` | null,
  pending: false,
  send: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("#/features/operator/operator-address", () => ({
  useOperatorAddress: () => state.operator,
  sameAddress: (left: string | null, right: string | null) =>
    Boolean(left && right && left.toLowerCase() === right.toLowerCase()),
}));
vi.mock("#/features/operator/use-operator-calls", () => ({
  useOperatorCalls: () => ({ mutateAsync: state.send, isPending: state.pending }),
}));
vi.mock("sonner", () => ({ toast: { success: state.success, error: state.error } }));

import { VoucherContractSheet } from "./voucher-contract-sheet";

function voucher(overrides: Partial<MarketVoucherDetail> = {}): MarketVoucherDetail {
  return {
    id: "1",
    chainId: 100,
    address: "0x3000000000000000000000000000000000000003",
    name: "Voucher",
    symbol: "VCH",
    decimals: 2,
    ownerAddress: OWNER,
    description: "Voucher",
    voucherUoa: "KES",
    voucherValue: "1",
    locationName: null,
    lat: null,
    lng: null,
    email: null,
    website: null,
    phone: null,
    terms: null,
    iconUrl: null,
    bannerUrl: null,
    tags: [],
    kind: "voucher",
    markerIcon: null,
    markerColor: null,
    active: true,
    ...overrides,
  };
}

beforeEach(() => {
  state.operator = OWNER;
  state.pending = false;
  state.send.mockReset().mockResolvedValue({ trackingId: "tracking" });
  state.success.mockReset();
  state.error.mockReset();
});

describe("VoucherContractSheet", () => {
  it("does not expose contract controls to a different wallet", () => {
    state.operator = WRITER;
    render(<VoucherContractSheet voucher={voucher()} open onClose={vi.fn()} />);
    expect(screen.getByText("VCH")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Mint" })).toBeNull();
  });

  it("mints, manages writers, and transfers ownership for the chain owner", async () => {
    render(<VoucherContractSheet voucher={voucher()} open onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "12.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Mint" }));

    fireEvent.change(screen.getByLabelText("Address"), { target: { value: WRITER } });
    fireEvent.click(screen.getByRole("button", { name: "Add writer" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove writer" }));

    fireEvent.change(screen.getByLabelText("New owner"), { target: { value: WRITER } });
    fireEvent.click(screen.getByRole("button", { name: "Transfer ownership" }));

    await waitFor(() => expect(state.send).toHaveBeenCalledTimes(4));
    expect(state.success).toHaveBeenCalledWith("Vouchers minted");
    expect(state.success).toHaveBeenCalledWith("Writer added");
    expect(state.success).toHaveBeenCalledWith("Writer removed");
    expect(state.success).toHaveBeenCalledWith("Ownership transferred");
  });

  it("validates writer addresses and reports failed calls", async () => {
    state.send.mockRejectedValueOnce(new Error("signature rejected"));
    render(<VoucherContractSheet voucher={voucher()} open onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Add writer" }));
    expect(state.error).toHaveBeenCalledWith("Enter an address");

    fireEvent.change(screen.getByLabelText("Address"), { target: { value: WRITER } });
    fireEvent.click(screen.getByRole("button", { name: "Add writer" }));
    await waitFor(() => expect(state.error).toHaveBeenCalledWith("signature rejected"));
  });
});
