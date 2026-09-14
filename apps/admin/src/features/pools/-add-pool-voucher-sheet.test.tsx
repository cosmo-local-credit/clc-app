import type { PoolVoucher, UserPool } from "@clc/api/features/pools/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { AddPoolVoucherSheet } from "./ui/add-pool-voucher-sheet";

const POOL = "0x8e0a000000000000000000000000000000000b41";
const REGISTRY = "0x61a8000000000000000000000000000000007001";
const LIMITER = "0x4d90000000000000000000000000000000000a1c";
const QUOTER = "0xb91c000000000000000000000000000000007d20";
const AGGREGATOR = "0x0826000000000000000000000000000000005e9d";
const RIBA = "0x3aa7000000000000000000000000000000000102";
const MUMO = "0x925b000000000000000000000000000000000a81";

const relayOperatorBatch = vi.hoisted(() => vi.fn());
const getFilteredMarketVouchers = vi.hoisted(() => vi.fn());
const getMarketVoucher = vi.hoisted(() => vi.fn());
const waitForTrackingCompletion = vi.hoisted(() => vi.fn());

vi.mock("#/features/auth/relay-batch", () => ({
  relayOperatorBatch: (...args: unknown[]) => relayOperatorBatch(...args),
}));

vi.mock("#/lib/api", () => ({
  clcApi: {
    market: {
      getFilteredMarketVouchers: (...args: unknown[]) => getFilteredMarketVouchers(...args),
      getMarketVoucher: (...args: unknown[]) => getMarketVoucher(...args),
    },
    auth: {
      waitForTrackingCompletion: (...args: unknown[]) => waitForTrackingCompletion(...args),
    },
  },
}));

function pool(overrides: Partial<UserPool> = {}): UserPool {
  return {
    id: "12",
    chainId: 42220,
    address: POOL as UserPool["address"],
    name: "Kilifi Growers",
    symbol: "KGP1",
    ownerAddress: null,
    feePpm: 10_000,
    feeAddress: null,
    tokenRegistryAddress: REGISTRY as UserPool["tokenRegistryAddress"],
    limiterAddress: LIMITER as UserPool["limiterAddress"],
    quoterAddress: QUOTER as UserPool["quoterAddress"],
    quoterType: "oracle",
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

function member(address: string): PoolVoucher {
  return {
    id: "9",
    chainId: 42220,
    name: "Mumo",
    description: "Mumo",
    symbol: "MUMO",
    tokenAddress: address as PoolVoucher["tokenAddress"],
    decimals: 6,
    ownerAddress: null,
    voucherType: null,
    voucherUoa: null,
    voucherValue: null,
    locationName: null,
    geoLat: null,
    geoLng: null,
    iconUrl: null,
    bannerUrl: null,
    active: true,
    internal: false,
    isAllowed: true,
    tokenLimit: "300000000",
    oracleFeedId: "7",
    oracleName: "KES / USD",
    oracleAddress: AGGREGATOR as PoolVoucher["oracleAddress"],
    offerCount: 0,
    availableOfferCount: 0,
    tags: [],
  };
}

const onAdded = vi.fn();

function renderSheet(overrides: Partial<UserPool> = {}, members: PoolVoucher[] = []) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <AddPoolVoucherSheet
        pool={pool(overrides)}
        poolVouchers={members}
        open
        onClose={() => {}}
        onAdded={onAdded}
      />
    </QueryClientProvider>,
  );
}

async function pickKiriba() {
  fireEvent.click(await waitFor(() => screen.getByRole("button", { name: /Kiriba/ })));
  // The decimals read gates submit, so wait for it the way an operator would see
  // it land rather than racing it.
  await waitFor(() => expect(screen.getByText(/6 dp/)).toBeTruthy());
}

beforeEach(() => {
  onAdded.mockReset();
  relayOperatorBatch.mockReset();
  getFilteredMarketVouchers.mockReset();
  getMarketVoucher.mockReset();
  waitForTrackingCompletion.mockReset();

  relayOperatorBatch.mockResolvedValue({ trackingId: "track-1", signatureType: "secp256k1" });
  waitForTrackingCompletion.mockResolvedValue({ txHash: `0x${"ab".repeat(32)}` });
  getMarketVoucher.mockResolvedValue({ address: RIBA, symbol: "RIBA", decimals: 6 });
  getFilteredMarketVouchers.mockResolvedValue({
    vouchers: [
      { id: "1", chainId: 42220, address: RIBA, name: "Kiriba", symbol: "RIBA", kind: "GOOD" },
      { id: "2", chainId: 42220, address: MUMO, name: "Mumo", symbol: "MUMO", kind: "GOOD" },
    ],
    receivedCount: 2,
  });
});

describe("AddPoolVoucherSheet", () => {
  it("hides vouchers the pool already allows", async () => {
    // Re-registering reverts the whole batch, so an already-allowed voucher must
    // not be offerable at all.
    renderSheet({}, [member(MUMO)]);

    await waitFor(() => expect(screen.getByRole("button", { name: /Kiriba/ })).toBeTruthy());
    expect(screen.queryByRole("button", { name: /Mumo/ })).toBeNull();
  });

  it("states the pool's recorded quoter instead of offering a choice", async () => {
    renderSheet({ quoterType: "oracle" });
    await pickKiriba();

    expect(screen.getByText(/quotes with/).textContent).toContain("Oracle feed");
    expect(screen.queryByLabelText("Quoter")).toBeNull();
    expect(screen.getByLabelText("Aggregator address")).toBeTruthy();
  });

  it("asks which quoter to configure when the catalog does not record one", async () => {
    renderSheet({ quoterType: null });
    await pickKiriba();

    expect(screen.getByLabelText("Quoter")).toBeTruthy();
    expect(screen.getByText(/does not record which quoter/)).toBeTruthy();
  });

  it("refuses a pool still on the retired relative quoter", async () => {
    // Registering without a rate is not neutral: RelativeQuoter reads an unset
    // token as parity, so the pair would silently start quoting 1:1.
    renderSheet({ quoterType: "relative" });

    fireEvent.click(await waitFor(() => screen.getByRole("button", { name: /Kiriba/ })));
    await waitFor(() => expect(screen.getByText(/retired RelativeQuoter/)).toBeTruthy());

    expect(screen.queryByLabelText("Aggregator address")).toBeNull();
    expect(screen.getByRole("button", { name: "Sign and add" }).hasAttribute("disabled")).toBe(
      true,
    );
  });

  it("configures nothing per voucher on a decimal quoter", async () => {
    renderSheet({ quoterType: "decimal" });
    await pickKiriba();

    expect(screen.getByText(/prices every pair from token decimals/)).toBeTruthy();
    expect(screen.queryByLabelText("Aggregator address")).toBeNull();
    expect(screen.queryByLabelText(/Rate \(PPM\)/)).toBeNull();
  });

  it("offers no cap when the pool has no limiter on record", async () => {
    renderSheet({ limiterAddress: null });

    fireEvent.click(await waitFor(() => screen.getByRole("button", { name: /Kiriba/ })));
    await waitFor(() => expect(screen.getByText(/no limiter on record/)).toBeTruthy());
    expect(screen.queryByLabelText(/Cap in RIBA/)).toBeNull();
  });

  it("scales the cap by the voucher's decimals and relays one batch", async () => {
    renderSheet();
    await pickKiriba();

    fireEvent.change(screen.getByLabelText(/Cap in RIBA/), { target: { value: "300" } });
    fireEvent.change(screen.getByLabelText("Aggregator address"), {
      target: { value: AGGREGATOR },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign and add" }));

    await waitFor(() => expect(relayOperatorBatch).toHaveBeenCalled());
    const calls = relayOperatorBatch.mock.calls[0]![0];

    // Registry, limiter, quoter — one batch, in that order.
    expect(calls.map((call: { to: string }) => call.to)).toEqual([REGISTRY, LIMITER, QUOTER]);
    // 300 RIBA at six decimals reaches the limiter as raw base units.
    expect(calls[1].data).toContain((300_000_000).toString(16));

    // The catalog lags the chain, so the screen is told which row to wait for.
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith(RIBA));
  });

  it("does not sign until the pricing the quoter needs is filled in", async () => {
    renderSheet();
    await pickKiriba();

    fireEvent.change(screen.getByLabelText(/Cap in RIBA/), { target: { value: "300" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign and add" }));

    await waitFor(() =>
      expect(screen.getByText("Enter the Chainlink aggregator address")).toBeTruthy(),
    );
    expect(relayOperatorBatch).not.toHaveBeenCalled();
  });

  it("does not sign without a cap when the pool has a limiter", async () => {
    // A limiter with no cap for the token rejects every deposit, so an empty
    // field would register a voucher nothing can be deposited into.
    renderSheet();
    await pickKiriba();

    fireEvent.change(screen.getByLabelText("Aggregator address"), {
      target: { value: AGGREGATOR },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign and add" }));

    await waitFor(() => expect(screen.getByText("Enter an amount greater than zero")).toBeTruthy());
    expect(relayOperatorBatch).not.toHaveBeenCalled();
  });
});
