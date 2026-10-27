import type { PoolVoucher, UserPool } from "@clc/api/features/pools/client";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const OWNER = "0x1000000000000000000000000000000000000001" as const;
const OTHER = "0x2000000000000000000000000000000000000002" as const;
const TOKEN = "0x3000000000000000000000000000000000000003" as const;
const RELAY = "0x4000000000000000000000000000000000000004" as const;

const state = vi.hoisted(() => ({
  operator: "0x1000000000000000000000000000000000000001" as `0x${string}` | null,
  pending: false,
  send: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  steward: { data: { maxStaleness: "90", multiplierPpm: "950000" }, isPending: false },
}));

vi.mock("#/features/operator/operator-address", () => ({
  useOperatorAddress: () => state.operator,
  sameAddress: (left: string | null, right: string | null) =>
    Boolean(left && right && left.toLowerCase() === right.toLowerCase()),
}));
vi.mock("#/features/operator/use-operator-calls", () => ({
  useOperatorCalls: () => ({ mutateAsync: state.send, isPending: state.pending }),
}));
vi.mock("../use-pool-steward", () => ({ usePoolStewardState: () => state.steward }));
vi.mock("sonner", () => ({ toast: { success: state.success, error: state.error } }));
vi.mock("#/components/admin/confirm-dialog", () => ({
  ConfirmDialog: ({
    open,
    title,
    confirmLabel,
    children,
    onCancel,
    onConfirm,
  }: {
    open: boolean;
    title: string;
    confirmLabel: string;
    children?: React.ReactNode;
    onCancel: () => void;
    onConfirm: () => void;
  }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        {children}
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    ) : null,
}));

import { PoolFeedPolicy, PoolFeedRowActions, PoolVoucherChainActions } from "./pool-chain-actions";

function pool(overrides: Partial<UserPool> = {}): UserPool {
  return {
    id: "1",
    chainId: 100,
    address: "0x5000000000000000000000000000000000000005",
    name: "Pool",
    symbol: "POOL",
    ownerAddress: OWNER,
    feePpm: 0,
    feeAddress: OWNER,
    tokenRegistryAddress: "0x6000000000000000000000000000000000000006",
    limiterAddress: "0x7000000000000000000000000000000000000007",
    quoterAddress: "0x8000000000000000000000000000000000000008",
    quoterType: "oracle",
    feePolicyAddress: null,
    protocolFeeControllerAddress: null,
    feesDecoupled: false,
    decimals: 6,
    description: "",
    unitOfAccount: "KES",
    locationName: null,
    geoLat: null,
    geoLng: null,
    email: null,
    website: null,
    phone: null,
    imageUrl: null,
    bannerUrl: null,
    terms: null,
    defaultVoucherId: null,
    voucherCount: 1,
    tags: [],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function voucher(): PoolVoucher {
  return {
    id: "9",
    chainId: 100,
    name: "Voucher",
    description: "",
    symbol: "VCH",
    tokenAddress: TOKEN,
    decimals: 2,
    ownerAddress: OWNER,
    voucherType: null,
    voucherUoa: "KES",
    voucherValue: "1",
    locationName: null,
    iconUrl: null,
    bannerUrl: null,
    active: true,
    internal: false,
    isAllowed: true,
    tokenLimit: null,
    oracleFeedId: "1",
    oracleName: "Feed",
    oracleAddress: RELAY,
    offerCount: 0,
    availableOfferCount: 0,
    tags: [],
    syncedAt: "2026-01-01T00:00:00Z",
  };
}

beforeEach(() => {
  state.operator = OWNER;
  state.pending = false;
  state.send.mockReset().mockResolvedValue({ trackingId: "tracking" });
  state.success.mockReset();
  state.error.mockReset();
  state.steward = { data: { maxStaleness: "90", multiplierPpm: "950000" }, isPending: false };
});

describe("pool chain actions", () => {
  it("hides mutation controls unless the operator owns the pool", () => {
    state.operator = OTHER;
    const { container } = render(<PoolVoucherChainActions pool={pool()} voucher={voucher()} />);
    expect(container.textContent).toBe("");

    const feed = render(
      <PoolFeedRowActions
        pool={pool()}
        group={{ key: "1", name: "Feed", address: RELAY, vouchers: [voucher()] }}
      />,
    );
    expect(feed.container.textContent).toBe("");
  });

  it("removes vouchers and validates per-holder limits", async () => {
    render(<PoolVoucherChainActions pool={pool()} voucher={voucher()} />);

    fireEvent.click(screen.getByRole("button", { name: "Remove VCH" }));
    let dialog = screen.getByRole("dialog", { name: "Remove VCH" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(state.success).toHaveBeenCalledWith("Voucher removed"));

    fireEvent.click(screen.getByRole("button", { name: "Limit VCH" }));
    dialog = screen.getByRole("dialog", { name: "Limit VCH" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Set limit" }));
    expect(state.error).toHaveBeenCalledWith("Enter a holder address.");

    fireEvent.change(within(dialog).getByLabelText("Holder"), { target: { value: OTHER } });
    fireEvent.change(within(dialog).getByLabelText("Amount"), { target: { value: "bad" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Set limit" }));
    expect(state.error).toHaveBeenCalled();

    fireEvent.change(within(dialog).getByLabelText("Amount"), { target: { value: "12.5" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Set limit" }));
    await waitFor(() => expect(state.success).toHaveBeenCalledWith("Holder limit set"));
    expect(state.send).toHaveBeenCalledTimes(2);
  });

  it("shows pending and resolved feed policy values", () => {
    const { rerender } = render(<PoolFeedPolicy pool={pool()} />);
    expect(screen.getByText("Staleness 90 · Multiplier 950000")).toBeTruthy();

    state.steward = { data: { maxStaleness: "90", multiplierPpm: "950000" }, isPending: true };
    rerender(<PoolFeedPolicy pool={pool()} />);
    expect(screen.getByText("Staleness Reading · Multiplier Reading")).toBeTruthy();
  });

  it("removes feeds and updates or invalidates a validated relay writer", async () => {
    const group = { key: "1", name: "Feed", address: RELAY, vouchers: [voucher()] };
    render(<PoolFeedRowActions pool={pool()} group={group} />);

    fireEvent.click(screen.getByRole("button", { name: "Remove feed" }));
    let dialog = screen.getByRole("dialog", { name: "Remove feed" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove feed" }));
    await waitFor(() => expect(state.success).toHaveBeenCalledWith("Feed removed"));

    fireEvent.click(screen.getByRole("button", { name: "Writer" }));
    dialog = screen.getByRole("dialog", { name: "Relay writer" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Set writer" }));
    expect(state.error).toHaveBeenCalledWith("Enter a writer address.");

    fireEvent.change(within(dialog).getByLabelText("Writer"), { target: { value: OTHER } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Invalidate" }));
    await waitFor(() => expect(state.success).toHaveBeenCalledWith("Relay invalidated"));

    fireEvent.click(screen.getByRole("button", { name: "Writer" }));
    dialog = screen.getByRole("dialog", { name: "Relay writer" });
    fireEvent.change(within(dialog).getByLabelText("Writer"), { target: { value: OTHER } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Set writer" }));
    await waitFor(() => expect(state.success).toHaveBeenCalledWith("Writer set"));
  });

  it("reports failed operator calls without closing the action", async () => {
    state.send.mockRejectedValueOnce(new Error("wallet rejected"));
    render(<PoolVoucherChainActions pool={pool()} voucher={voucher()} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove VCH" }));
    const dialog = screen.getByRole("dialog", { name: "Remove VCH" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(state.error).toHaveBeenCalledWith("wallet rejected"));
    expect(screen.getByRole("dialog", { name: "Remove VCH" })).toBeTruthy();
  });
});
