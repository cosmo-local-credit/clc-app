import type { PoolVoucher, UserPool } from "@clc/api/features/pools/client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const OWNER = "0x1000000000000000000000000000000000000001" as const;
const RECIPIENT = "0x2000000000000000000000000000000000000002" as const;
const TOKEN = "0x3000000000000000000000000000000000000003" as const;
const TOKEN_TWO = "0x4000000000000000000000000000000000000004" as const;
const RELAY = "0x5000000000000000000000000000000000000005" as const;

const state = vi.hoisted(() => ({
  operator: "0x1000000000000000000000000000000000000001" as `0x${string}` | null,
  pending: false,
  send: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  steward: {
    data: {
      owner: "0x1000000000000000000000000000000000000001",
      sealState: 0,
      feeAddress: "0x1000000000000000000000000000000000000001",
      maxStaleness: "60",
      multiplierPpm: "950000",
    },
    isPending: false,
  },
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
vi.mock("#/lib/ownership-transfer-config", () => ({ POOL_OWNERSHIP_TRANSFER_ENABLED: true }));
vi.mock("sonner", () => ({ toast: { success: state.success, error: state.error } }));

import { PoolControlsSheet } from "./pool-controls-sheet";

function pool(overrides: Partial<UserPool> = {}): UserPool {
  return {
    id: "1",
    chainId: 100,
    address: "0x6000000000000000000000000000000000000006",
    name: "Community Pool",
    symbol: "POOL",
    ownerAddress: OWNER,
    feePpm: 3_000,
    feeAddress: OWNER,
    tokenRegistryAddress: "0x7000000000000000000000000000000000000007",
    limiterAddress: "0x8000000000000000000000000000000000000008",
    quoterAddress: "0x9000000000000000000000000000000000000009",
    quoterType: "oracle",
    feePolicyAddress: "0xa00000000000000000000000000000000000000a",
    protocolFeeControllerAddress: "0xb00000000000000000000000000000000000000b",
    feesDecoupled: true,
    decimals: 6,
    description: "Pool",
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
    voucherCount: 2,
    tags: [],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function voucher(overrides: Partial<PoolVoucher> = {}): PoolVoucher {
  return {
    id: "11",
    chainId: 100,
    name: "Voucher",
    description: "Voucher",
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
    oracleFeedId: null,
    oracleName: null,
    oracleAddress: null,
    offerCount: 0,
    availableOfferCount: 0,
    tags: [],
    syncedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  state.operator = OWNER;
  state.pending = false;
  state.send.mockReset().mockResolvedValue({ trackingId: "tracking" });
  state.success.mockReset();
  state.error.mockReset();
  state.steward.data = {
    owner: OWNER,
    sealState: 0,
    feeAddress: OWNER,
    maxStaleness: "60",
    multiplierPpm: "950000",
  };
});

describe("PoolControlsSheet", () => {
  it("keeps chain controls hidden from an operator who is not the owner", () => {
    state.operator = RECIPIENT;
    render(<PoolControlsSheet pool={pool()} vouchers={[voucher()]} open onClose={vi.fn()} />);

    expect(screen.getByText(OWNER)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save fee" })).toBeNull();
  });

  it("submits every owner operation with validated form values", async () => {
    render(<PoolControlsSheet pool={pool()} vouchers={[voucher()]} open onClose={vi.fn()} />);

    const percents = screen.getAllByLabelText("Percent");
    fireEvent.change(percents[0]!, { target: { value: "1.5" } });
    const recipients = screen.getAllByLabelText("Recipient");
    fireEvent.change(recipients[0]!, { target: { value: RECIPIENT } });
    fireEvent.click(screen.getByRole("button", { name: "Save fee" }));

    fireEvent.change(screen.getByLabelText("Token in"), { target: { value: TOKEN } });
    fireEvent.change(screen.getByLabelText("Token out"), { target: { value: TOKEN_TWO } });
    fireEvent.change(percents[1]!, { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Set pair fee" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    fireEvent.change(screen.getByLabelText("Amount", { selector: "#liquidity-amount" }), {
      target: { value: "2.5" },
    });
    fireEvent.change(recipients[1]!, { target: { value: RECIPIENT } });
    fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));
    fireEvent.click(screen.getByRole("button", { name: "Collect fees" }));

    fireEvent.change(screen.getByLabelText("Max staleness, seconds"), {
      target: { value: "120" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save staleness" }));
    fireEvent.change(screen.getByLabelText("Multiplier, PPM"), {
      target: { value: "950000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save multiplier" }));
    fireEvent.change(screen.getByLabelText("Relay"), { target: { value: RELAY } });
    fireEvent.change(screen.getByLabelText("Writer"), { target: { value: RECIPIENT } });
    fireEvent.click(screen.getByRole("button", { name: "Set writer" }));
    fireEvent.click(screen.getByRole("button", { name: "Invalidate" }));

    fireEvent.change(screen.getByLabelText("Token", { selector: "#token" }), {
      target: { value: TOKEN },
    });
    fireEvent.change(screen.getByLabelText("Holder"), { target: { value: RECIPIENT } });
    fireEvent.change(screen.getByLabelText("Amount", { selector: "#holder-amount" }), {
      target: { value: "9" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set limit" }));

    fireEvent.click(screen.getAllByRole("checkbox")[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Seal" }));

    fireEvent.change(screen.getByLabelText("New owner"), { target: { value: RECIPIENT } });
    fireEvent.click(screen.getByRole("button", { name: "Transfer ownership" }));

    await waitFor(() => expect(state.send).toHaveBeenCalledTimes(12));
    expect(state.success).toHaveBeenCalledWith("Ownership transferred");
  });

  it("reports invalid values and keeps failed calls recoverable", async () => {
    state.send.mockRejectedValueOnce(new Error("relay unavailable"));
    render(<PoolControlsSheet pool={pool()} vouchers={[voucher()]} open onClose={vi.fn()} />);

    fireEvent.change(screen.getAllByLabelText("Percent")[0]!, { target: { value: "bad" } });
    fireEvent.click(screen.getByRole("button", { name: "Save fee" }));
    fireEvent.click(screen.getByRole("button", { name: "Set pair fee" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));
    fireEvent.change(screen.getByLabelText("Max staleness, seconds"), {
      target: { value: "1.5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save staleness" }));
    fireEvent.change(screen.getByLabelText("Multiplier, PPM"), {
      target: { value: "bad" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save multiplier" }));
    fireEvent.change(screen.getByLabelText("Multiplier, PPM"), {
      target: { value: "899999" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save multiplier" }));
    fireEvent.click(screen.getByRole("button", { name: "Set limit" }));
    fireEvent.click(screen.getByRole("button", { name: "Transfer ownership" }));

    fireEvent.change(screen.getByLabelText("Voucher"), { target: { value: "invalid" } });
    fireEvent.click(screen.getByRole("button", { name: "Collect fees" }));

    fireEvent.change(screen.getByLabelText("Max staleness, seconds"), {
      target: { value: "30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save staleness" }));

    await waitFor(() => expect(state.error).toHaveBeenCalledWith("relay unavailable"));
    expect(state.error.mock.calls.length).toBeGreaterThanOrEqual(6);
  });

  it("blocks zero pair-fee submissions", async () => {
    render(<PoolControlsSheet pool={pool()} vouchers={[voucher()]} open onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Token in"), { target: { value: TOKEN } });
    fireEvent.change(screen.getByLabelText("Token out"), { target: { value: TOKEN_TWO } });
    const pairPercent = screen.getAllByLabelText("Percent")[1]! as HTMLInputElement;
    fireEvent.change(pairPercent, { target: { value: "0" } });
    await waitFor(() => expect(pairPercent.value).toBe("0"));
    fireEvent.click(screen.getByRole("button", { name: "Set pair fee" }));

    await waitFor(() =>
      expect(state.error).toHaveBeenCalledWith("Remove the pair fee instead of storing zero."),
    );
    expect(state.send).not.toHaveBeenCalled();
  });
});
