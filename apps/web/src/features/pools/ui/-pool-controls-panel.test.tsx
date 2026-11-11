vi.mock("#/components/retirement/retirement-control", () => ({
  RetirementControl: () => <button type="button">Request retirement</button>,
}));
vi.mock("#/features/wallet/hooks/use-account-balances", () => ({
  useAllAccountTokens: () => mocks.indexed,
}));
vi.mock("#/lib/ownership-transfer-config", () => ({ POOL_OWNERSHIP_TRANSFER_ENABLED: true }));
vi.mock("#/features/pools/hooks/use-pool-ownership-transfer", () => ({
  usePoolOwnershipTransfer: () => ({
    mutateAsync: mocks.transferOwnership,
    isPending: mocks.ownershipPending,
  }),
}));
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render as rtlRender, screen, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { decodeFunctionData, zeroAddress } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { BackendApiError } from "@clc/api/client/errors";
import type { PoolVoucher, UserPool } from "@clc/api/features/pools/client";
import type { CaliburCall } from "@clc/core/features/webauthn/index";
import {
  feePolicySetDefaultFeeAbi,
  swapPoolSetFeeAddressAbi,
  swapPoolWithdrawLiquidityAbi,
} from "@clc/core/features/pool-admin/logic";
import { swapPoolWithdrawAllFeesAbi } from "@clc/core/features/pool-swaps/logic";

const POOL = "0x8e0a000000000000000000000000000000000b41";
const TOKEN = "0x3aa7000000000000000000000000000000000102";
const OWNER = "0x1234000000000000000000000000000000005678";
const RECIPIENT = "0x9911000000000000000000000000000000002244";
const FEE_POLICY = "0x70c1000000000000000000000000000000003b55";
const SAFE = "0x5AFe000000000000000000000000000000000005";

const mocks = vi.hoisted(() => ({
  relay: vi.fn(),
  transferOwnership: vi.fn(),
  ownershipPending: false,
  treasury: new Map<string, { balanceRaw: string; feesRaw: string; withdrawableRaw: string }>(),
  // The fee and the recipient come from the chain, never from the catalog row.
  feeSettings: { data: undefined } as {
    data?: {
      feePpm: string;
      feePercent: string;
      feeAddress: string | null;
      feeAddressSealed?: boolean | null;
    };
    isError?: boolean;
  },
  safeOwned: false,
  // The fee address on chain at submit, which may differ from the form's read.
  liveFeeAddress: vi.fn(),
  reverse: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  indexed: {
    tokens: [] as never[],
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  },
}));

vi.mock("#/components/safe/recipient-owner-notice", () => ({ RecipientOwnerNotice: () => null }));
vi.mock("wagmi", () => ({
  useConnection: () => ({ address: OWNER }),
  useClient: () => ({ chain: { id: 100 } }),
}));
vi.mock("viem/actions", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  readContract: (_client: unknown, request: { functionName: string }) =>
    request.functionName === "feeAddress"
      ? mocks.liveFeeAddress()
      : Promise.reject(new Error(`unexpected read ${request.functionName}`)),
}));
vi.mock("#/features/ownership/hooks/use-asset-owner-info", () => ({
  useAssetOwnerInfo: () =>
    mocks.safeOwned
      ? {
          owner: SAFE,
          info: { kind: "safe", owner: SAFE, signers: [OWNER], threshold: 1 },
          isSafeOwned: true,
          isSafeSigner: true,
          canManage: true,
        }
      : {
          owner: undefined,
          info: undefined,
          isSafeOwned: false,
          isSafeSigner: false,
          canManage: true,
        },
}));

vi.mock("#/features/pools/hooks/use-pool-admin", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  usePoolAdminRelay: () => ({ mutateAsync: mocks.relay, isPending: false }),
}));

vi.mock("#/features/pools/hooks/use-pool-treasury", () => ({
  usePoolTreasury: () => ({ data: mocks.treasury }),
  poolTreasuryQueryKeys: { all: ["pool-treasury"] },
}));

vi.mock("#/features/pools/hooks/use-pool-fee-settings", () => ({
  usePoolFeeSettings: () => mocks.feeSettings,
  poolFeeSettingsQueryKeys: { all: ["pool-fee-settings"] },
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

vi.mock("#/features/wallet/hooks/use-recipient-resolution", () => ({
  useRecipientSearch: () => ({ data: null, error: null, isPending: false }),
  useReverseRecipientResolution: (address: string | null) => mocks.reverse(address),
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
    feePolicyAddress: FEE_POLICY,
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
  mocks.transferOwnership.mockReset().mockResolvedValue({ catalogSynced: true });
  mocks.ownershipPending = false;
  mocks.relay.mockReset();
  mocks.relay.mockResolvedValue({ trackingId: "t1", txHash: `0x${"ab".repeat(32)}` });
  mocks.treasury = new Map([
    [TOKEN, { balanceRaw: "1000000000", feesRaw: "4000000", withdrawableRaw: "996000000" }],
  ]);
  mocks.feeSettings = {
    data: { feePpm: "10000", feePercent: "1", feeAddress: RECIPIENT },
  };
  mocks.safeOwned = false;
  mocks.liveFeeAddress.mockReset().mockResolvedValue(RECIPIENT);
  mocks.reverse.mockReset().mockReturnValue({ data: null, error: null, isPending: false });
  mocks.toastError.mockReset();
  mocks.toastSuccess.mockReset();
  mocks.indexed = { tokens: [], isPending: false, isError: false, refetch: vi.fn() };
});

afterEach(() => {
  vi.clearAllMocks();
});

/** The owner forms read writes in flight from the query client. */
function render(ui: ReactElement) {
  const client = new QueryClient();
  return rtlRender(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

const poolCallsAbi = [
  ...swapPoolSetFeeAddressAbi,
  ...swapPoolWithdrawAllFeesAbi,
  ...swapPoolWithdrawLiquidityAbi,
];
const REPLACED_CARD = {
  data: undefined,
  error: new BackendApiError(410, "card replaced", "E20", { kind: "card-replaced" }),
  isPending: false,
};
const LOOKING_UP = { data: undefined, error: null, isPending: true };

const decodeRelayed = () =>
  relayedCalls().map((call) => decodeFunctionData({ abi: poolCallsAbi, data: call.data }));

async function openSheet(row: RegExp) {
  render(<PoolControlsPanel pool={pool()} vouchers={[voucher()]} canManageOnChain />);
  fireEvent.click(screen.getByRole("button", { name: row }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: /Pepas Voucher/ }));
  return dialog;
}

describe("PoolControlsPanel withdrawing liquidity", () => {
  it("sends the named amount to the signed-in wallet and leaves reserved fees behind", async () => {
    const dialog = await openSheet(/Withdraw liquidity/);
    // Decoupled fees are not withdrawable liquidity, so the row offers 996, not 1000.
    fireEvent.click(within(dialog).getByRole("button", { name: "Max" }));
    expect((within(dialog).getByLabelText("Amount") as HTMLInputElement).value).toBe("996");
    expect((within(dialog).getByLabelText("Recipient") as HTMLInputElement).value).toBe(OWNER);

    fireEvent.click(within(dialog).getByRole("button", { name: "Withdraw" }));
    await waitFor(() => expect(mocks.relay).toHaveBeenCalledTimes(1));
    expect(relayedCalls().map((call) => call.to)).toEqual([POOL]);
    expect(decodeRelayed()).toEqual([
      { functionName: "withdrawLiquidity", args: [TOKEN, OWNER, 996000000n] },
    ]);
  });

  it("pays the signed-in signer, not the Safe, on a Safe-owned pool", async () => {
    mocks.safeOwned = true;
    const dialog = await openSheet(/Withdraw liquidity/);
    expect((within(dialog).getByLabelText("Recipient") as HTMLInputElement).value).toBe(OWNER);
    fireEvent.change(within(dialog).getByLabelText("Amount"), { target: { value: "5" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Withdraw" }));

    await waitFor(() => expect(mocks.relay).toHaveBeenCalledTimes(1));
    expect(decodeRelayed()).toEqual([
      { functionName: "withdrawLiquidity", args: [TOKEN, OWNER, 5000000n] },
    ]);
  });

  it("pays the recipient the steward names", async () => {
    const dialog = await openSheet(/Withdraw liquidity/);
    fireEvent.change(within(dialog).getByLabelText("Amount"), { target: { value: "5" } });
    fireEvent.change(within(dialog).getByLabelText("Recipient"), { target: { value: SAFE } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Withdraw" }));

    await waitFor(() => expect(mocks.relay).toHaveBeenCalledTimes(1));
    expect(decodeRelayed()).toEqual([
      { functionName: "withdrawLiquidity", args: [TOKEN, SAFE, 5000000n] },
    ]);
  });

  it("refuses an invalid recipient and the pool itself", async () => {
    const dialog = await openSheet(/Withdraw liquidity/);
    fireEvent.change(within(dialog).getByLabelText("Amount"), { target: { value: "5" } });
    const withdraw = within(dialog).getByRole("button", { name: "Withdraw" }) as HTMLButtonElement;

    fireEvent.change(within(dialog).getByLabelText("Recipient"), { target: { value: "0x12" } });
    expect(within(dialog).getByText("Enter a valid wallet address")).toBeTruthy();
    expect(withdraw.disabled).toBe(true);

    fireEvent.change(within(dialog).getByLabelText("Recipient"), { target: { value: POOL } });
    expect(within(dialog).getByText("The pool can't pay itself.")).toBeTruthy();
    expect(withdraw.disabled).toBe(true);
  });

  it("pays nothing to a replaced Sign-in card", async () => {
    mocks.reverse.mockImplementation((address: string | null) =>
      address?.toLowerCase() === SAFE.toLowerCase()
        ? REPLACED_CARD
        : { data: null, error: null, isPending: false },
    );
    const dialog = await openSheet(/Withdraw liquidity/);
    fireEvent.change(within(dialog).getByLabelText("Amount"), { target: { value: "5" } });
    fireEvent.change(within(dialog).getByLabelText("Recipient"), { target: { value: SAFE } });

    expect(
      await within(dialog).findByText(
        "This sign-in card was replaced. Ask its owner for their new address.",
      ),
    ).toBeTruthy();
    const withdraw = within(dialog).getByRole("button", { name: "Withdraw" }) as HTMLButtonElement;
    expect(withdraw.disabled).toBe(true);
    fireEvent.click(withdraw);
    expect(mocks.relay).not.toHaveBeenCalled();
  });

  it("waits for the recipient lookup before paying", async () => {
    mocks.reverse.mockReturnValue(LOOKING_UP);
    const dialog = await openSheet(/Withdraw liquidity/);
    fireEvent.change(within(dialog).getByLabelText("Amount"), { target: { value: "5" } });
    expect(
      (within(dialog).getByRole("button", { name: "Withdraw" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("refuses an amount above what the pool can release", async () => {
    const dialog = await openSheet(/Withdraw liquidity/);
    fireEvent.change(within(dialog).getByLabelText("Amount"), { target: { value: "1000" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Withdraw" }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
    expect(mocks.relay).not.toHaveBeenCalled();
  });
});

describe("PoolControlsPanel collecting fees", () => {
  it("pays the signed-in wallet by pointing the fee address there and back", async () => {
    const dialog = await openSheet(/Withdraw fees/);
    expect((within(dialog).getByLabelText("Recipient") as HTMLInputElement).value).toBe(OWNER);
    fireEvent.click(within(dialog).getByRole("button", { name: "Collect fees" }));

    await waitFor(() => expect(mocks.relay).toHaveBeenCalledTimes(1));
    expect(relayedCalls().map((call) => call.to)).toEqual([POOL, POOL, POOL]);
    expect(decodeRelayed()).toEqual([
      { functionName: "setFeeAddress", args: [OWNER] },
      { functionName: "withdraw", args: [TOKEN] },
      { functionName: "setFeeAddress", args: [RECIPIENT] },
    ]);
  });

  it("collects with the single call when the recipient is the pool's fee address", async () => {
    const dialog = await openSheet(/Withdraw fees/);
    fireEvent.change(within(dialog).getByLabelText("Recipient"), { target: { value: RECIPIENT } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Collect fees" }));

    await waitFor(() => expect(mocks.relay).toHaveBeenCalledTimes(1));
    expect(decodeRelayed()).toEqual([{ functionName: "withdraw", args: [TOKEN] }]);
  });

  it("restores the fee address the chain holds at submit, not the form's read", async () => {
    // The form read RECIPIENT; another transaction has since moved it to SAFE.
    mocks.liveFeeAddress.mockResolvedValue(SAFE);
    const dialog = await openSheet(/Withdraw fees/);
    fireEvent.click(within(dialog).getByRole("button", { name: "Collect fees" }));

    await waitFor(() => expect(mocks.relay).toHaveBeenCalledTimes(1));
    expect(decodeRelayed()).toEqual([
      { functionName: "setFeeAddress", args: [OWNER] },
      { functionName: "withdraw", args: [TOKEN] },
      { functionName: "setFeeAddress", args: [SAFE] },
    ]);
  });

  it("pays the named recipient even when the fee address moved off it since the read", async () => {
    mocks.liveFeeAddress.mockResolvedValue(SAFE);
    const dialog = await openSheet(/Withdraw fees/);
    fireEvent.change(within(dialog).getByLabelText("Recipient"), { target: { value: RECIPIENT } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Collect fees" }));

    await waitFor(() => expect(mocks.relay).toHaveBeenCalledTimes(1));
    expect(decodeRelayed()).toEqual([
      { functionName: "setFeeAddress", args: [RECIPIENT] },
      { functionName: "withdraw", args: [TOKEN] },
      { functionName: "setFeeAddress", args: [SAFE] },
    ]);
  });

  it("relays nothing when the live fee address cannot be read", async () => {
    mocks.liveFeeAddress.mockRejectedValue(new Error("rpc down"));
    const dialog = await openSheet(/Withdraw fees/);
    fireEvent.click(within(dialog).getByRole("button", { name: "Collect fees" }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
    expect(mocks.relay).not.toHaveBeenCalled();
  });

  it("pays no fees to a replaced Sign-in card", async () => {
    mocks.reverse.mockImplementation((address: string | null) =>
      address?.toLowerCase() === SAFE.toLowerCase()
        ? REPLACED_CARD
        : { data: null, error: null, isPending: false },
    );
    const dialog = await openSheet(/Withdraw fees/);
    fireEvent.change(within(dialog).getByLabelText("Recipient"), { target: { value: SAFE } });
    await within(dialog).findByText(
      "This sign-in card was replaced. Ask its owner for their new address.",
    );
    expect(
      (within(dialog).getByRole("button", { name: "Collect fees" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("collects from a pool with no fee recipient and leaves it unset", async () => {
    mocks.feeSettings = { data: { feePpm: "10000", feePercent: "1", feeAddress: null } };
    mocks.liveFeeAddress.mockResolvedValue(zeroAddress);
    const dialog = await openSheet(/Withdraw fees/);
    fireEvent.click(within(dialog).getByRole("button", { name: "Collect fees" }));

    await waitFor(() => expect(mocks.relay).toHaveBeenCalledTimes(1));
    expect(decodeRelayed()).toEqual([
      { functionName: "setFeeAddress", args: [OWNER] },
      { functionName: "withdraw", args: [TOKEN] },
      { functionName: "setFeeAddress", args: [zeroAddress] },
    ]);
  });

  it("pins the recipient to a sealed fee address", async () => {
    mocks.feeSettings = {
      data: { feePpm: "10000", feePercent: "1", feeAddress: RECIPIENT, feeAddressSealed: true },
    };
    const dialog = await openSheet(/Withdraw fees/);
    expect(within(dialog).queryByLabelText("Recipient")).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Collect fees" }));

    await waitFor(() => expect(mocks.relay).toHaveBeenCalledTimes(1));
    expect(decodeRelayed()).toEqual([{ functionName: "withdraw", args: [TOKEN] }]);
  });

  it("waits for the pool's fee address before collecting", async () => {
    mocks.feeSettings = { data: undefined };
    const dialog = await openSheet(/Withdraw fees/);
    expect(
      (within(dialog).getByRole("button", { name: "Collect fees" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});

describe("PoolControlsPanel fee settings", () => {
  it("shows the rate and recipient the chain reports, not the catalog's", () => {
    render(
      <PoolControlsPanel
        pool={pool({ feeAddress: null, feePpm: null })}
        vouchers={[voucher()]}
        canManageOnChain
      />,
    );
    // The catalog row carries neither value; the row must still read 1%.
    expect(screen.getByRole("button", { name: /Fee % and recipient/ }).textContent).toContain("1%");
  });

  it("relays the rate and the recipient as one batch", async () => {
    render(<PoolControlsPanel pool={pool()} vouchers={[voucher()]} canManageOnChain />);
    fireEvent.click(screen.getByRole("button", { name: /Fee % and recipient/ }));

    const dialog = await screen.findByRole("dialog");
    const fee = within(dialog).getByLabelText("Swap fee (%)") as HTMLInputElement;
    const recipient = within(dialog).getByLabelText("Fee recipient") as HTMLInputElement;
    expect(fee.value).toBe("1");
    expect(recipient.value).toBe(RECIPIENT);

    fireEvent.change(fee, { target: { value: "2.5" } });
    fireEvent.change(recipient, { target: { value: OWNER } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save fee settings" }));

    await waitFor(() => expect(mocks.relay).toHaveBeenCalledTimes(1));
    const calls = relayedCalls();
    expect(calls.map((call) => call.to)).toEqual([FEE_POLICY, POOL]);
    expect(decodeFunctionData({ abi: feePolicySetDefaultFeeAbi, data: calls[0]!.data })).toEqual({
      functionName: "setDefaultFee",
      args: [25_000n],
    });
    expect(decodeFunctionData({ abi: swapPoolSetFeeAddressAbi, data: calls[1]!.data })).toEqual({
      functionName: "setFeeAddress",
      args: [OWNER],
    });
  });

  it("sends only the value that changed", async () => {
    render(<PoolControlsPanel pool={pool()} vouchers={[voucher()]} canManageOnChain />);
    fireEvent.click(screen.getByRole("button", { name: /Fee % and recipient/ }));

    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Swap fee (%)"), { target: { value: "0" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save fee settings" }));

    await waitFor(() => expect(mocks.relay).toHaveBeenCalledTimes(1));
    expect(relayedCalls().map((call) => call.to)).toEqual([FEE_POLICY]);
  });

  it("will not save an address the pool could never pay", async () => {
    render(<PoolControlsPanel pool={pool()} vouchers={[voucher()]} canManageOnChain />);
    fireEvent.click(screen.getByRole("button", { name: /Fee % and recipient/ }));

    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Fee recipient"), {
      target: { value: "0x0000000000000000000000000000000000000000" },
    });
    expect(
      (within(dialog).getByRole("button", { name: "Save fee settings" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("will not save a fee the contract would reject", async () => {
    render(<PoolControlsPanel pool={pool()} vouchers={[voucher()]} canManageOnChain />);
    fireEvent.click(screen.getByRole("button", { name: /Fee % and recipient/ }));

    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Swap fee (%)"), { target: { value: "120" } });
    expect(
      (within(dialog).getByRole("button", { name: "Save fee settings" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("keeps the button inert while nothing has changed", async () => {
    render(<PoolControlsPanel pool={pool()} vouchers={[voucher()]} canManageOnChain />);
    fireEvent.click(screen.getByRole("button", { name: /Fee % and recipient/ }));

    const dialog = await screen.findByRole("dialog");
    expect(
      (within(dialog).getByRole("button", { name: "Save fee settings" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});

describe("PoolControlsPanel ownership", () => {
  it("places retirement after transfer for owners and withholds both from catalog-only admins", () => {
    const view = render(<PoolControlsPanel pool={pool()} vouchers={[]} canManageOnChain />);
    const rows = within(screen.getByRole("region", { name: "Pool controls" })).getAllByRole(
      "button",
    );
    expect(rows.at(-2)?.textContent).toContain("Transfer ownership");
    expect(rows.at(-1)?.textContent).toContain("Request retirement");
    view.rerender(<PoolControlsPanel pool={pool()} vouchers={[]} canManageOnChain={false} />);
    expect(screen.queryByRole("button", { name: "Transfer ownership" })).toBeNull();
    expect(screen.getByRole("button", { name: "Edit details" })).toBeTruthy();
  });

  it("withholds retirement when the catalog has no current owner", () => {
    render(
      <PoolControlsPanel pool={pool({ ownerAddress: null })} vouchers={[]} canManageOnChain />,
    );
    expect(screen.queryByRole("button", { name: "Request retirement" })).toBeNull();
  });

  it("shows owner-voucher loading and retry states in withdrawal sheets", async () => {
    mocks.indexed = { tokens: [], isPending: true, isError: false, refetch: vi.fn() };
    const view = render(<PoolControlsPanel pool={pool()} vouchers={[]} canManageOnChain />);
    fireEvent.click(screen.getByRole("button", { name: "Withdraw liquidity" }));
    expect((await screen.findByRole("status")).textContent).toContain("Loading vouchers…");

    mocks.indexed = { tokens: [], isPending: false, isError: true, refetch: vi.fn() };
    view.rerender(<PoolControlsPanel pool={pool()} vouchers={[]} canManageOnChain />);
    expect((await screen.findByRole("alert")).textContent).toContain("Couldn't load vouchers.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(mocks.indexed.refetch).toHaveBeenCalledOnce();
  });

  it("retries owner-voucher discovery from the fee withdrawal sheet", async () => {
    const refetch = vi.fn();
    mocks.indexed = { tokens: [], isPending: false, isError: true, refetch };
    render(<PoolControlsPanel pool={pool()} vouchers={[]} canManageOnChain />);

    fireEvent.click(screen.getByRole("button", { name: "Withdraw fees" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Couldn't load vouchers.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("keeps the profile editor blocked while protected pool info loads or fails", async () => {
    const retry = vi.fn();
    const view = render(
      <PoolControlsPanel
        pool={pool()}
        vouchers={[]}
        canManageOnChain={false}
        privateInfo={{ isPending: true, isError: false, isFetching: true, retry }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit details" }));
    expect(await screen.findByText("Loading pool information…")).toBeTruthy();

    view.rerender(
      <PoolControlsPanel
        pool={pool()}
        vouchers={[]}
        canManageOnChain={false}
        privateInfo={{ isPending: false, isError: true, isFetching: false, retry }}
      />,
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Couldn't load pool information.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledOnce();
  });
  it("shows the unchanged fee recipient and rejects invalid, self and dependency recipients", async () => {
    render(<PoolControlsPanel pool={pool()} vouchers={[]} canManageOnChain />);
    fireEvent.click(screen.getByRole("button", { name: "Transfer ownership" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(RECIPIENT)).toBeTruthy();
    expect(within(dialog).getByText("Existing fee recipient")).toBeTruthy();
    for (const value of [
      "invalid",
      "0x0000000000000000000000000000000000000000",
      OWNER,
      POOL,
      FEE_POLICY,
    ]) {
      fireEvent.change(within(dialog).getByRole("textbox", { name: "New owner address" }), {
        target: { value },
      });
      fireEvent.click(within(dialog).getByRole("button", { name: "Transfer ownership" }));
      await waitFor(() =>
        expect(
          within(dialog)
            .getByRole("textbox", { name: "New owner address" })
            .getAttribute("aria-invalid"),
        ).toBe("true"),
      );
      expect(mocks.transferOwnership).not.toHaveBeenCalled();
    }
    fireEvent.change(within(dialog).getByRole("textbox", { name: "New owner address" }), {
      target: { value: RECIPIENT },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Transfer ownership" }));
    await waitFor(() =>
      expect(mocks.transferOwnership).toHaveBeenCalledWith({
        assetAddress: POOL,
        ownerAddress: OWNER,
        newOwnerAddress: RECIPIENT,
      }),
    );
  });
  it("disables the transfer button and recipient while waiting", async () => {
    mocks.ownershipPending = true;
    render(<PoolControlsPanel pool={pool()} vouchers={[]} canManageOnChain />);
    fireEvent.click(screen.getByRole("button", { name: "Transfer ownership" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      (within(dialog).getByRole("button", { name: /Waiting for the chain/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (within(dialog).getByRole("textbox", { name: "New owner address" }) as HTMLInputElement)
        .disabled,
    ).toBe(true);
  });
});
