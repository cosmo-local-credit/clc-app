import type { PoolVoucher, UserPool } from "@clc/api/features/pools/client";
import { poolKeys } from "@clc/api/features/pools/queries";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { PoolVoucherEdit } from "./ui/pool-holdings-panel";
import { AddPoolVoucherSheet } from "./ui/add-pool-voucher-sheet";

const POOL = "0x8e0a000000000000000000000000000000000b41";
const REGISTRY = "0x61a8000000000000000000000000000000007001";
const LIMITER = "0x4d90000000000000000000000000000000000a1c";
const QUOTER = "0xb91c000000000000000000000000000000007d20";
const AGGREGATOR = "0x0826000000000000000000000000000000005e9d";
const EUR_FEED = "0xab70BCB260073d036d1660201e9d5405F5829b7a";
const UNVERIFIED = "0x9a48d9b0AF457eF040281A9Af3867bc65522Fecd";
const RIBA = "0x3aa7000000000000000000000000000000000102";
const MUMO = "0x925b000000000000000000000000000000000a81";

const relayOperatorBatch = vi.hoisted(() => vi.fn());
const getFilteredMarketVouchers = vi.hoisted(() => vi.fn());
const getMarketVoucher = vi.hoisted(() => vi.fn());
const waitForTrackingCompletion = vi.hoisted(() => vi.fn());
const listOracleFeeds = vi.hoisted(() => vi.fn());
const voucherOracle = vi.hoisted(() => vi.fn());
const chain = vi.hoisted(() => ({ real: false, multicall: vi.fn() }));

// The chain read, replaced so each test states what the quoter holds now. A
// test about the read's lifecycle runs the real hook on its QueryClient, with
// only the RPC call faked.
vi.mock("./use-pool-voucher-oracle", async (importOriginal) => {
  const actual = await importOriginal<Record<string, (...args: unknown[]) => unknown>>();
  return {
    usePoolVoucherOracle: (...args: unknown[]) =>
      chain.real ? actual.usePoolVoucherOracle?.(...args) : voucherOracle(...args),
  };
});

vi.mock("viem/actions", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  multicall: (_client: unknown, args: unknown) => chain.multicall(args),
}));

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
    oracleFeeds: {
      listOracleFeeds: (...args: unknown[]) => listOracleFeeds(...args),
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

/** The real read's cache key, for the pool and voucher these tests edit. */
function oracleKey() {
  return [...poolKeys.all, "voucher-oracle", 42220, QUOTER, RIBA];
}

const onAdded = vi.fn();
const onUpdated = vi.fn();

function renderSheet(
  overrides: Partial<UserPool> = {},
  members: PoolVoucher[] = [],
  edit?: PoolVoucherEdit,
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  return render(
    <QueryClientProvider client={queryClient}>
      <AddPoolVoucherSheet
        pool={pool(overrides)}
        poolVouchers={members}
        edit={edit}
        open
        onClose={() => {}}
        onAdded={onAdded}
        onUpdated={onUpdated}
      />
    </QueryClientProvider>,
  );
}

/** Base UI commits an unhighlighted item only for a touch pointer; jsdom fires no hover. */
async function chooseFeed(name: string | RegExp) {
  fireEvent.click(screen.getByLabelText("Price feed"));
  const option = await screen.findByRole("option", { name });
  fireEvent.pointerDown(option, { pointerType: "touch" });
  fireEvent.click(option);
}

function onChain(aggregator: string | null, maxStalenessSeconds = "0") {
  voucherOracle.mockReturnValue({
    isPending: false,
    isError: false,
    data: { aggregator, maxStalenessSeconds },
  });
}

function quoterTarget(calls: Array<{ to: string; data: string }>) {
  return calls.find((call) => call.to === QUOTER);
}

async function pickKiriba() {
  fireEvent.click(await waitFor(() => screen.getByRole("button", { name: /Kiriba/ })));
  // The decimals read gates submit, so wait for it the way an operator would see
  // it land rather than racing it.
  await waitFor(() => expect(screen.getByText(/6 dp/)).toBeTruthy());
}

beforeEach(() => {
  onAdded.mockReset();
  onUpdated.mockReset();
  relayOperatorBatch.mockReset();
  getFilteredMarketVouchers.mockReset();
  getMarketVoucher.mockReset();
  waitForTrackingCompletion.mockReset();
  listOracleFeeds.mockReset();
  voucherOracle.mockReset();
  chain.real = false;
  chain.multicall.mockReset();

  listOracleFeeds.mockResolvedValue([
    {
      id: "7",
      chainId: 100,
      name: "KES",
      address: AGGREGATOR,
      description: "KES / USD",
      decimals: 8,
      maxStalenessSeconds: null,
    },
    {
      id: "8",
      chainId: 100,
      name: "EUR",
      address: EUR_FEED,
      description: "EUR / USD",
      decimals: 8,
      maxStalenessSeconds: 93_600,
    },
  ]);
  voucherOracle.mockReturnValue({ isPending: false, isError: false, data: undefined });

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

    expect(screen.getByText("Oracle feed")).toBeTruthy();
    expect(screen.queryByLabelText("Quoter")).toBeNull();
    expect(screen.getByLabelText("Price feed")).toBeTruthy();
    expect(screen.queryByLabelText("Aggregator address")).toBeNull();
  });

  it("asks which quoter to configure when the catalog does not record one", async () => {
    renderSheet({ quoterType: null });
    await pickKiriba();

    expect(screen.getByLabelText("Quoter")).toBeTruthy();
  });

  it("requires an explicit relative rate and signs its PPM setter", async () => {
    renderSheet({ quoterType: "relative" });
    await pickKiriba();
    expect(screen.queryByLabelText("Price feed")).toBeNull();
    fireEvent.change(screen.getByLabelText(/Cap in RIBA/), { target: { value: "300" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign and add" }));
    await waitFor(() =>
      expect(
        screen.getByText("Enter a positive rate with at most six decimal places"),
      ).toBeTruthy(),
    );
    expect(relayOperatorBatch).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Exchange rate"), { target: { value: "1.25" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign and add" }));
    await waitFor(() => expect(relayOperatorBatch).toHaveBeenCalled());
    const calls = relayOperatorBatch.mock.calls[0]![0];
    expect(calls.map((call: { to: string }) => call.to)).toEqual([REGISTRY, LIMITER, QUOTER]);
    expect(calls[2].data).toContain((1_250_000).toString(16));
  });

  it("configures nothing per voucher on a decimal quoter", async () => {
    renderSheet({ quoterType: "decimal" });
    await pickKiriba();

    expect(screen.getByText("Decimals only")).toBeTruthy();
    expect(screen.queryByLabelText("Price feed")).toBeNull();
    expect(screen.queryByLabelText(/Rate \(PPM\)/)).toBeNull();
  });

  it("updates a relative voucher's cap to zero without rewriting its rate", async () => {
    const voucher = member(RIBA);
    renderSheet({ quoterType: "relative" }, [voucher], {
      voucher,
      ratePpm: "1250000",
      capRaw: "300000000",
    });
    expect(screen.getByLabelText("Exchange rate").getAttribute("value")).toBe("1.25");
    fireEvent.change(screen.getByLabelText(/Cap in MUMO/), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign and update" }));
    await waitFor(() => expect(relayOperatorBatch).toHaveBeenCalled());
    expect(relayOperatorBatch.mock.calls[0]![0].map((call: { to: string }) => call.to)).toEqual([
      LIMITER,
    ]);
    expect(onUpdated).toHaveBeenCalledWith({ expectedCapRaw: "0" });
  });

  it("keeps a just-raised cap when the next edit sees the old indexed cap", async () => {
    const voucher = member(RIBA);
    const edit = { voucher, ratePpm: "1250000", capRaw: "300000000" };
    const first = renderSheet({ quoterType: "relative" }, [voucher], edit);
    fireEvent.change(screen.getByLabelText(/Cap in MUMO/), { target: { value: "600" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign and update" }));
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith({ expectedCapRaw: "600000000" }));
    first.unmount();
    relayOperatorBatch.mockClear();
    onUpdated.mockClear();

    // The confirmed cap is 600, but the catalog still supplies 300 to this edit.
    renderSheet({ quoterType: "relative" }, [voucher], edit);
    fireEvent.change(screen.getByLabelText(/Cap in MUMO/), { target: { value: "300.000000" } });
    fireEvent.change(screen.getByLabelText("Exchange rate"), { target: { value: "2.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign and update" }));
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith({}));
    expect(relayOperatorBatch.mock.calls[0]![0].map((call: { to: string }) => call.to)).toEqual([
      QUOTER,
    ]);
  });

  it("signs both setters when the operator changes both the cap and relative rate", async () => {
    const voucher = member(RIBA);
    renderSheet({ quoterType: "relative" }, [voucher], {
      voucher,
      ratePpm: "1250000",
      capRaw: "300000000",
    });
    fireEvent.change(screen.getByLabelText(/Cap in MUMO/), { target: { value: "600" } });
    fireEvent.change(screen.getByLabelText("Exchange rate"), { target: { value: "2.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign and update" }));
    await waitFor(() => expect(relayOperatorBatch).toHaveBeenCalled());
    expect(relayOperatorBatch.mock.calls[0]![0].map((call: { to: string }) => call.to)).toEqual([
      LIMITER,
      QUOTER,
    ]);
  });

  it("does not rewrite an unchanged oracle during a cap-only edit", async () => {
    const voucher = member(RIBA);
    onChain(AGGREGATOR);
    renderSheet({}, [voucher], { voucher, ratePpm: null, capRaw: "300000000" });
    await waitFor(() =>
      expect(screen.getByLabelText("Price feed").textContent).toContain("KES / USD"),
    );
    fireEvent.change(screen.getByLabelText(/Cap in MUMO/), { target: { value: "600" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign and update" }));
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith({ expectedCapRaw: "600000000" }));
    expect(relayOperatorBatch.mock.calls[0]![0].map((call: { to: string }) => call.to)).toEqual([
      LIMITER,
    ]);
  });

  it("seeds the feed and its bound from the chain, not the lagging catalog", async () => {
    const voucher = member(RIBA);
    onChain(EUR_FEED, "93600");
    renderSheet({}, [voucher], { voucher, ratePpm: null, capRaw: "300000000" });

    await waitFor(() =>
      expect(screen.getByLabelText("Price feed").textContent).toContain("EUR / USD"),
    );
    expect((screen.getByLabelText(/Freshness bound/) as HTMLInputElement).value).toBe("93600");

    // Unchanged against the chain, so nothing is written even though the
    // catalog still names the old feed.
    fireEvent.click(screen.getByRole("button", { name: "Sign and update" }));
    await waitFor(() => expect(screen.queryByText("Waiting…")).toBeNull());
    expect(relayOperatorBatch).not.toHaveBeenCalled();
  });

  it("shows an unregistered aggregator as a custom address and replaces it", async () => {
    const voucher = member(RIBA);
    onChain(UNVERIFIED);
    renderSheet({}, [voucher], { voucher, ratePpm: null, capRaw: "300000000" });

    await waitFor(() =>
      expect((screen.getByLabelText("Aggregator address") as HTMLInputElement).value).toBe(
        UNVERIFIED,
      ),
    );
    expect(screen.getByLabelText("Price feed").textContent).toContain("Custom address");

    await chooseFeed(/EUR \/ USD/);
    expect((screen.getByLabelText(/Freshness bound/) as HTMLInputElement).value).toBe("93600");
    fireEvent.click(screen.getByRole("button", { name: "Sign and update" }));
    await waitFor(() => expect(relayOperatorBatch).toHaveBeenCalled());
    const call = quoterTarget(relayOperatorBatch.mock.calls[0]![0]);
    expect(call?.data).toContain(EUR_FEED.slice(2).toLowerCase());
    expect(call?.data).toContain((93_600).toString(16));
    expect(onUpdated).toHaveBeenCalledWith({ expectedOracleAddress: EUR_FEED });
  });

  it("seeds from the refreshed chain read, not a cached one, before a cap-only save", async () => {
    // A cached mapping from an earlier visit is out of date: the chain now has
    // EUR. The form must not seed KES from cache and then write it back.
    chain.real = true;
    const voucher = member(RIBA);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(oracleKey(), { aggregator: AGGREGATOR, maxStalenessSeconds: "0" });
    let answer: (value: unknown) => void = () => {};
    chain.multicall.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    renderSheet({}, [voucher], { voucher, ratePpm: null, capRaw: "300000000" }, client);

    await waitFor(() => expect(chain.multicall).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Sign and update" }).hasAttribute("disabled")).toBe(
      true,
    );
    fireEvent.change(screen.getByLabelText(/Cap in MUMO/), { target: { value: "600" } });
    answer([EUR_FEED, 0n]);
    await waitFor(() =>
      expect(screen.getByLabelText("Price feed").textContent).toContain("EUR / USD"),
    );

    fireEvent.click(screen.getByRole("button", { name: "Sign and update" }));
    await waitFor(() => expect(relayOperatorBatch).toHaveBeenCalled());
    expect(relayOperatorBatch.mock.calls[0]![0].map((call: { to: string }) => call.to)).toEqual([
      LIMITER,
    ]);
  });

  it("does not write back a feed the chain replaced after the form was seeded", async () => {
    chain.real = true;
    const voucher = member(RIBA);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    chain.multicall.mockResolvedValueOnce([AGGREGATOR, 0n]);
    renderSheet({}, [voucher], { voucher, ratePpm: null, capRaw: "300000000" }, client);
    await waitFor(() =>
      expect(screen.getByLabelText("Price feed").textContent).toContain("KES / USD"),
    );

    // Someone else moves the voucher to EUR; the steward only edits the cap.
    fireEvent.change(screen.getByLabelText(/Cap in MUMO/), { target: { value: "600" } });
    chain.multicall.mockResolvedValueOnce([EUR_FEED, 0n]);
    await client.refetchQueries({ queryKey: oracleKey() });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Sign and update" }).hasAttribute("disabled")).toBe(
        false,
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Sign and update" }));
    await waitFor(() => expect(relayOperatorBatch).toHaveBeenCalled());
    expect(relayOperatorBatch.mock.calls[0]![0].map((call: { to: string }) => call.to)).toEqual([
      LIMITER,
    ]);
  });

  it("holds submit while the current feed is read from the chain", async () => {
    const voucher = member(RIBA);
    voucherOracle.mockReturnValue({ isPending: true, isError: false, data: undefined });
    renderSheet({}, [voucher], { voucher, ratePpm: null, capRaw: "300000000" });

    expect(screen.getByText("Reading the current feed…")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign and update" }).hasAttribute("disabled")).toBe(
      true,
    );
  });

  it("does not ask for a signature when only amount formatting changed", async () => {
    const info = vi.spyOn(toast, "info");
    try {
      const voucher = member(RIBA);
      renderSheet({ quoterType: "relative" }, [voucher], {
        voucher,
        ratePpm: "1250000",
        capRaw: "300000000",
      });
      fireEvent.change(screen.getByLabelText(/Cap in MUMO/), { target: { value: "0300.000000" } });
      fireEvent.change(screen.getByLabelText("Exchange rate"), { target: { value: "01.250000" } });
      fireEvent.click(screen.getByRole("button", { name: "Sign and update" }));
      await waitFor(() => expect(info).toHaveBeenCalledWith("No changes to save."));
      expect(relayOperatorBatch).not.toHaveBeenCalled();
      expect(onUpdated).not.toHaveBeenCalled();
    } finally {
      info.mockRestore();
    }
  });

  it("adds to a decimal pool without sending a quoter setter", async () => {
    renderSheet({ quoterType: "decimal" });
    await pickKiriba();
    fireEvent.change(screen.getByLabelText(/Cap in RIBA/), { target: { value: "300" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign and add" }));
    await waitFor(() => expect(relayOperatorBatch).toHaveBeenCalled());
    expect(relayOperatorBatch.mock.calls[0]![0].map((call: { to: string }) => call.to)).toEqual([
      REGISTRY,
      LIMITER,
    ]);
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
    await chooseFeed(/KES \/ USD/);
    fireEvent.click(screen.getByRole("button", { name: "Sign and add" }));

    await waitFor(() => expect(relayOperatorBatch).toHaveBeenCalled());
    const calls = relayOperatorBatch.mock.calls[0]![0];

    // Registry, limiter, quoter — one batch, in that order.
    expect(calls.map((call: { to: string }) => call.to)).toEqual([REGISTRY, LIMITER, QUOTER]);
    // 300 RIBA at six decimals reaches the limiter as raw base units.
    expect(calls[1].data).toContain((300_000_000).toString(16));
    expect(calls[2].data).toContain(AGGREGATOR.slice(2).toLowerCase());

    // The catalog lags the chain, so the screen is told which row to wait for.
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith(RIBA));
  });

  it("sends a registry feed's freshness bound with the three-argument setter", async () => {
    renderSheet();
    await pickKiriba();

    fireEvent.change(screen.getByLabelText(/Cap in RIBA/), { target: { value: "300" } });
    await chooseFeed(/EUR \/ USD/);
    expect((screen.getByLabelText(/Freshness bound/) as HTMLInputElement).value).toBe("93600");
    fireEvent.click(screen.getByRole("button", { name: "Sign and add" }));

    await waitFor(() => expect(relayOperatorBatch).toHaveBeenCalled());
    const call = quoterTarget(relayOperatorBatch.mock.calls[0]![0]);
    expect(call?.data).toContain(EUR_FEED.slice(2).toLowerCase());
    expect(call?.data).toContain((93_600).toString(16));
  });

  it("takes a custom aggregator address", async () => {
    renderSheet();
    await pickKiriba();

    fireEvent.change(screen.getByLabelText(/Cap in RIBA/), { target: { value: "300" } });
    await chooseFeed("Custom address");
    fireEvent.click(screen.getByRole("button", { name: "Sign and add" }));
    await waitFor(() =>
      expect(screen.getByText("Enter the Chainlink aggregator address")).toBeTruthy(),
    );
    expect(relayOperatorBatch).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Aggregator address"), {
      target: { value: UNVERIFIED },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign and add" }));
    await waitFor(() => expect(relayOperatorBatch).toHaveBeenCalled());
    expect(quoterTarget(relayOperatorBatch.mock.calls[0]![0])?.data).toContain(
      UNVERIFIED.slice(2).toLowerCase(),
    );
  });

  it("does not sign until a price feed is chosen", async () => {
    renderSheet();
    await pickKiriba();

    fireEvent.change(screen.getByLabelText(/Cap in RIBA/), { target: { value: "300" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign and add" }));

    await waitFor(() => expect(screen.getByText("Choose a price feed")).toBeTruthy());
    expect(relayOperatorBatch).not.toHaveBeenCalled();
  });

  it("offers Retry when the feed registry cannot be loaded, and still takes a custom address", async () => {
    listOracleFeeds.mockRejectedValueOnce(new Error("down"));
    renderSheet();
    await pickKiriba();

    expect(await screen.findByText("Could not load price feeds.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByText("Could not load price feeds.")).toBeNull());
    expect(listOracleFeeds).toHaveBeenCalledTimes(2);
  });

  it("says so when the chain has no verified feeds", async () => {
    listOracleFeeds.mockResolvedValue([]);
    renderSheet();
    await pickKiriba();

    expect(await screen.findByText("No verified feeds on this chain.")).toBeTruthy();
  });

  it("does not sign without a cap when the pool has a limiter", async () => {
    // A limiter with no cap for the token rejects every deposit, so an empty
    // field would register a voucher nothing can be deposited into.
    renderSheet();
    await pickKiriba();

    await chooseFeed(/KES \/ USD/);
    fireEvent.click(screen.getByRole("button", { name: "Sign and add" }));

    await waitFor(() => expect(screen.getByText("Enter an amount greater than zero")).toBeTruthy());
    expect(relayOperatorBatch).not.toHaveBeenCalled();
  });
});
