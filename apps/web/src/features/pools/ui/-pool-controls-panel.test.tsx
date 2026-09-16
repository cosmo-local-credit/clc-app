import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { decodeFunctionData } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { PoolVoucher, UserPool } from "@clc/api/features/pools/client";
import type { CaliburCall } from "@clc/core/features/webauthn/index";
import {
  swapPoolSetFeeAddressAbi,
  swapPoolWithdrawLiquidityAbi,
} from "@clc/core/features/pool-admin/logic";
import { swapPoolWithdrawAllFeesAbi } from "@clc/core/features/pool-swaps/logic";

const POOL = "0x8e0a000000000000000000000000000000000b41";
const TOKEN = "0x3aa7000000000000000000000000000000000102";
const OWNER = "0x1234000000000000000000000000000000005678";
const RECIPIENT = "0x9911000000000000000000000000000000002244";

const mocks = vi.hoisted(() => ({
  relay: vi.fn(),
  treasury: new Map<string, { balanceRaw: string; feesRaw: string; withdrawableRaw: string }>(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("wagmi", () => ({
  useConnection: () => ({ address: OWNER }),
}));

vi.mock("#/features/pools/hooks/use-pool-admin", () => ({
  usePoolAdminRelay: () => ({ mutateAsync: mocks.relay, isPending: false }),
}));

vi.mock("#/features/pools/hooks/use-pool-treasury", () => ({
  usePoolTreasury: () => ({ data: mocks.treasury }),
  poolTreasuryQueryKeys: { all: ["pool-treasury"] },
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

vi.mock("#/components/wallet", () => ({
  SignHint: () => <p>Sign hint</p>,
}));

vi.mock("#/features/wallet/hooks/use-recipient-resolution", () => ({
  useEnsRecipientResolution: () => ({ data: null, error: null, isPending: false }),
  usePhoneRecipientResolution: () => ({ data: null, error: null, isPending: false }),
  useReverseEnsResolution: () => ({ data: null, error: null, isPending: false }),
}));

import { PoolControlsPanel } from "./pool-controls-panel";

function pool(overrides: Partial<UserPool> = {}): UserPool {
  return {
    id: "7",
    chainId: 100,
    address: POOL,
    name: "Kilifi Traders",
    symbol: "KLF",
    ownerAddress: OWNER,
    feePpm: 10_000,
    feeAddress: RECIPIENT,
    tokenRegistryAddress: null,
    limiterAddress: null,
    quoterAddress: null,
    quoterType: "relative",
    feePolicyAddress: null,
    protocolFeeControllerAddress: null,
    feesDecoupled: true,
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
    ...overrides,
  };
}

function voucher(): PoolVoucher {
  return {
    id: "v1",
    chainId: 100,
    name: "Pepas Voucher",
    description: "",
    symbol: "PEPAS",
    tokenAddress: TOKEN,
    decimals: 6,
    ownerAddress: null,
    voucherType: null,
    voucherUoa: null,
    voucherValue: null,
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
  };
}

function relayedCalls(): CaliburCall[] {
  return mocks.relay.mock.calls[0]?.[0] as CaliburCall[];
}

beforeEach(() => {
  mocks.relay.mockReset();
  mocks.relay.mockResolvedValue({ trackingId: "t1", txHash: `0x${"ab".repeat(32)}` });
  mocks.treasury = new Map([
    [TOKEN, { balanceRaw: "1000000000", feesRaw: "4000000", withdrawableRaw: "996000000" }],
  ]);
  mocks.toastError.mockReset();
  mocks.toastSuccess.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("PoolControlsPanel withdrawing liquidity", () => {
  it("sends the named amount to the owner and leaves reserved fees behind", async () => {
    render(<PoolControlsPanel pool={pool()} vouchers={[voucher()]} canManageOnChain />);
    fireEvent.click(screen.getByRole("button", { name: /Withdraw liquidity/ }));

    const dialog = await screen.findByRole("dialog");
    // Decoupled fees are not withdrawable liquidity, so the row offers 996, not 1000.
    fireEvent.click(within(dialog).getByRole("button", { name: /Pepas Voucher/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Max" }));
    expect((within(dialog).getByLabelText("Amount") as HTMLInputElement).value).toBe("996");

    fireEvent.click(within(dialog).getByRole("button", { name: "Withdraw" }));
    await waitFor(() => expect(mocks.relay).toHaveBeenCalledTimes(1));
    const calls = relayedCalls();
    expect(calls.map((call) => call.to)).toEqual([POOL]);
    expect(decodeFunctionData({ abi: swapPoolWithdrawLiquidityAbi, data: calls[0]!.data })).toEqual(
      { functionName: "withdrawLiquidity", args: [TOKEN, OWNER, 996000000n] },
    );
  });

  it("refuses an amount above what the pool can release", async () => {
    render(<PoolControlsPanel pool={pool()} vouchers={[voucher()]} canManageOnChain />);
    fireEvent.click(screen.getByRole("button", { name: /Withdraw liquidity/ }));

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /Pepas Voucher/ }));
    fireEvent.change(within(dialog).getByLabelText("Amount"), { target: { value: "1000" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Withdraw" }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
    expect(mocks.relay).not.toHaveBeenCalled();
  });
});

describe("PoolControlsPanel collecting fees", () => {
  it("collects the whole accrued balance for one voucher", async () => {
    render(<PoolControlsPanel pool={pool()} vouchers={[voucher()]} canManageOnChain />);
    fireEvent.click(screen.getByRole("button", { name: /Withdraw fees/ }));

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /Pepas Voucher/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Collect fees" }));

    await waitFor(() => expect(mocks.relay).toHaveBeenCalledTimes(1));
    expect(
      decodeFunctionData({ abi: swapPoolWithdrawAllFeesAbi, data: relayedCalls()[0]!.data }),
    ).toEqual({ functionName: "withdraw", args: [TOKEN] });
  });

  it("blocks collection while the pool has no fee recipient", async () => {
    // `withdraw(token)` pays `feeAddress`, so with none set it reverts
    // InvalidFeeAddress; saying so beforehand is cheaper than a failed relay.
    render(
      <PoolControlsPanel
        pool={pool({ feeAddress: null })}
        vouchers={[voucher()]}
        canManageOnChain
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Withdraw fees/ }));

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /Pepas Voucher/ }));
    expect(
      (within(dialog).getByRole("button", { name: "Collect fees" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});

describe("PoolControlsPanel fee recipient", () => {
  it("re-points the pool at a new address", async () => {
    render(<PoolControlsPanel pool={pool()} vouchers={[voucher()]} canManageOnChain />);
    fireEvent.click(screen.getByRole("button", { name: /Fee recipient/ }));

    const dialog = await screen.findByRole("dialog");
    const input = within(dialog).getByLabelText("Wallet address") as HTMLInputElement;
    expect(input.value).toBe(RECIPIENT);

    fireEvent.change(input, { target: { value: OWNER } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save recipient" }));

    await waitFor(() => expect(mocks.relay).toHaveBeenCalledTimes(1));
    expect(
      decodeFunctionData({ abi: swapPoolSetFeeAddressAbi, data: relayedCalls()[0]!.data }),
    ).toEqual({ functionName: "setFeeAddress", args: [OWNER] });
  });

  it("will not save an address the pool could never pay", async () => {
    render(<PoolControlsPanel pool={pool()} vouchers={[voucher()]} canManageOnChain />);
    fireEvent.click(screen.getByRole("button", { name: /Fee recipient/ }));

    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Wallet address"), {
      target: { value: "0x0000000000000000000000000000000000000000" },
    });
    expect(
      (within(dialog).getByRole("button", { name: "Save recipient" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});
