import {
  swapPoolGetQuoteAbi,
  swapRouterQuoteExactInputAbi,
  swapRouterQuoteExactOutputAbi,
} from "@clc/core/features/pool-swaps/logic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { decodeFunctionData, encodeFunctionResult, type Hex } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const {
  navigate,
  poolLiquidityBalance,
  publicClientCall,
  publicClientMulticall,
  swapMutateAsync,
  swapTransferState,
} = vi.hoisted(() => ({
  navigate: vi.fn(),
  poolLiquidityBalance: { value: 1_000_000_000n },
  publicClientCall: vi.fn(),
  publicClientMulticall: vi.fn(),
  swapMutateAsync: vi.fn(),
  swapTransferState: { error: null as Error | null, isPending: false },
}));

vi.mock("@tanstack/react-router", () => ({
  // Router props are dropped, but ARIA and identity props are forwarded: the
  // pool tab strip is built from Links and its roles are part of the contract.
  Link: ({
    children,
    to: _to,
    params: _params,
    search: _search,
    replace: _replace,
    resetScroll: _resetScroll,
    preload: _preload,
    ...props
  }: Record<string, unknown> & { children?: React.ReactNode }) => (
    <a {...(props as React.ComponentProps<"a">)}>{children}</a>
  ),
  useRouter: () => ({ history: { back: vi.fn() } }),
  useCanGoBack: () => false,
  useNavigate: () => navigate,
}));

vi.mock("viem/actions", () => ({
  call: (_client: unknown, args: unknown) => publicClientCall(args),
  getBlockNumber: () => Promise.resolve(100n),
  multicall: (_client: unknown, args: unknown) => publicClientMulticall(args),
}));

vi.mock("wagmi", () => ({
  useClient: () => ({ uid: "test-client" }),
  useConnection: () => ({ address: "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d" }),
}));

vi.mock("#/features/webauthn/hooks/use-calibur-delegation", () => ({
  useCaliburDelegation: () => "delegated",
}));

vi.mock("#/features/pools/hooks/use-pool-swap-transfer", () => ({
  usePoolSwapTransfer: () => ({
    mutateAsync: swapMutateAsync,
    isPending: swapTransferState.isPending,
    error: swapTransferState.error,
  }),
}));

import { PoolDetailPage } from "./pool-detail-page";
import { PoolSwapPage } from "./pool-swap-page";

const POOL_ADDRESS = "0x1111111111111111111111111111111111111111";
const USDC_ADDRESS = "0x765DE816845861e75A25fCA122bb6898B8B1282a";
const TTX_ADDRESS = "0x2222222222222222222222222222222222222222";

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function mockPoolRequests({ usdcBalance = "12340000" }: { usdcBalance?: string } = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes(`/api/v2/pools/${POOL_ADDRESS}/vouchers`)) {
        return Promise.resolve(
          response({
            vouchers: [
              {
                id: 1,
                address: USDC_ADDRESS,
                name: "USD Coin",
                symbol: "USDC",
                decimals: 6,
                iconUrl: "https://pool.example/usdc.png",
              },
              {
                id: 2,
                address: TTX_ADDRESS,
                name: "Trade Token",
                symbol: "TTX",
                decimals: 6,
                iconUrl: "https://pool.example/ttx.png",
              },
            ],
          }),
        );
      }
      if (url.includes(`/api/v2/accounts/`) && url.includes("/tokens?")) {
        return Promise.resolve(
          response({
            tokens: [
              {
                id: 11,
                tokenAddress: USDC_ADDRESS,
                tokenSymbol: "USDC",
                tokenName: "USD Coin",
                tokenDecimals: 6,
                balance: usdcBalance,
                iconUrl: "https://wallet.example/usdc.png",
                lastDateBlock: "2026-07-24T00:00:00Z",
              },
              {
                id: 12,
                tokenAddress: TTX_ADDRESS,
                tokenSymbol: "TTX",
                tokenName: "Trade Token",
                tokenDecimals: 6,
                balance: "9000000",
                iconUrl: "https://wallet.example/ttx.png",
                lastDateBlock: "2026-07-24T00:00:00Z",
              },
            ],
          }),
        );
      }
      if (url.includes(`/api/v2/pools/${POOL_ADDRESS}/offerings`)) {
        return Promise.resolve(
          response({
            offerings: [
              {
                id: 91,
                voucherId: 1,
                voucherAddress: USDC_ADDRESS,
                voucherName: "USD Coin",
                voucherSymbol: "USDC",
                sellerAddress: "0x1111111111111111111111111111111111111111",
                commodityName: "Maize",
                commodityType: "GOOD",
                description: "A sack of maize",
                quantity: "4",
                unit: "bag",
                frequency: "week",
                price: "25",
                available: true,
                tags: [],
              },
              {
                id: 90,
                voucherId: 2,
                voucherAddress: TTX_ADDRESS,
                voucherName: "Trade Token",
                voucherSymbol: "TTX",
                sellerAddress: "0x2222222222222222222222222222222222222222",
                commodityName: "Tailoring",
                commodityType: "SERVICE",
                description: "",
                quantity: "1",
                unit: null,
                frequency: null,
                price: "8",
                available: true,
                tags: [],
              },
            ],
            first: 91,
            last: 90,
          }),
        );
      }
      if (url.includes(`/api/v2/pools/${POOL_ADDRESS}`)) {
        return Promise.resolve(
          response({
            address: POOL_ADDRESS,
            name: "Trade Pool",
            symbol: "TRD",
          }),
        );
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    }),
  );
}

function response(result: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: "",
    text: () => Promise.resolve(JSON.stringify({ ok: true, result })),
  };
}

beforeEach(() => {
  poolLiquidityBalance.value = 1_000_000_000n;
  swapTransferState.error = null;
  swapTransferState.isPending = false;
  swapMutateAsync.mockResolvedValue({ trackingId: "swap-tracking-1", signatureType: "secp256k1" });
  publicClientMulticall.mockImplementation(() =>
    Promise.resolve([poolLiquidityBalance.value, false, 0n]),
  );
  publicClientCall.mockImplementation(({ data }: { data: Hex }) => {
    try {
      const decoded = decodeFunctionData({ abi: swapRouterQuoteExactInputAbi, data });
      return Promise.resolve({
        data: encodeFunctionResult({
          abi: swapRouterQuoteExactInputAbi,
          functionName: "quoteExactInput",
          result: decoded.args[1] * 2n,
        }),
      });
    } catch {
      try {
        const decoded = decodeFunctionData({ abi: swapRouterQuoteExactOutputAbi, data });
        return Promise.resolve({
          data: encodeFunctionResult({
            abi: swapRouterQuoteExactOutputAbi,
            functionName: "quoteExactOutput",
            result: decoded.args[1] / 2n,
          }),
        });
      } catch {
        const decoded = decodeFunctionData({ abi: swapPoolGetQuoteAbi, data });
        return Promise.resolve({
          data: encodeFunctionResult({
            abi: swapPoolGetQuoteAbi,
            functionName: "getQuote",
            result: decoded.args[2] * 2n,
          }),
        });
      }
    }
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  navigate.mockReset();
  publicClientCall.mockReset();
  publicClientMulticall.mockReset();
  swapMutateAsync.mockReset();
});

describe("pool voucher UI", () => {
  it("renders wallet image logos for pool vouchers instead of text glyphs", async () => {
    mockPoolRequests();
    renderWithQueryClient(<PoolDetailPage poolAddress={POOL_ADDRESS} activeTab="vouchers" />);

    expect(await screen.findByText("USD Coin")).toBeTruthy();
    await waitFor(() => {
      expect(document.querySelector('img[src="https://wallet.example/usdc.png"]')).toBeTruthy();
      expect(document.querySelector('img[src="https://wallet.example/ttx.png"]')).toBeTruthy();
    });
  });

  it("lists every pool offering and shows the voucher symbol each one is priced in", async () => {
    mockPoolRequests();
    renderWithQueryClient(<PoolDetailPage poolAddress={POOL_ADDRESS} activeTab="offerings" />);

    const panel = await screen.findByRole("tabpanel");
    expect(await within(panel).findByText("Maize")).toBeTruthy();
    expect(within(panel).getByText("Tailoring")).toBeTruthy();

    // A pool's offerings come from different vouchers, so each tile has to say
    // which one it belongs to — the voucher page deliberately does not.
    const attributions = Array.from(panel.querySelectorAll('[data-slot="offering-voucher"]'));
    expect(attributions.map((element) => element.textContent)).toEqual(["USDC", "TTX"]);
    // The same blue the wallet's Pools action uses.
    expect(attributions.every((element) => element.className.includes("text-info"))).toBe(true);

    // The unit rides with the price now, so the tile says what the amount buys.
    expect(within(panel).getByText("25 USDC per bag")).toBeTruthy();
    // An offering with no unit keeps the bare price rather than reading "per null".
    expect(within(panel).getByText("8 TTX")).toBeTruthy();
    // The pool view is read-only for everyone. `OfferingsPanel` takes management
    // actions as a prop rather than deriving ownership, precisely so this screen
    // — which lists offerings from vouchers the viewer does not own — cannot
    // acquire write controls by accident.
    expect(within(panel).queryByRole("button", { name: "Edit" })).toBeNull();
    expect(within(panel).queryByRole("button", { name: "Remove" })).toBeNull();
    expect(panel.querySelector(".grid")?.className).toContain("grid-cols-2");
  });

  it("opens the same offering sheet from a pool as from a voucher page", async () => {
    mockPoolRequests();
    renderWithQueryClient(<PoolDetailPage poolAddress={POOL_ADDRESS} activeTab="offerings" />);

    fireEvent.click(await screen.findByRole("button", { name: "View offering details: Maize" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("A sack of maize")).toBeTruthy();
    expect(within(dialog).getByText("25 USDC each")).toBeTruthy();
    expect(within(dialog).getByText("Total").parentElement?.textContent).toContain("25 USDC");
    expect(within(dialog).getByRole("button", { name: /Add to cart/ })).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: "Increase quantity" }));
    expect(within(dialog).getByText("Total").parentElement?.textContent).toContain("50 USDC");
  });

  it("puts offerings first and links the vouchers tab without stacking history", async () => {
    mockPoolRequests();
    renderWithQueryClient(<PoolDetailPage poolAddress={POOL_ADDRESS} activeTab="offerings" />);

    const tabs = await screen.findAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Offerings", "Vouchers"]);
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
    expect(tabs[0]?.getAttribute("aria-controls")).toBe("pool-panel-offerings");
    expect(tabs[1]?.getAttribute("aria-controls")).toBe("pool-panel-vouchers");
    expect(screen.getByRole("tabpanel").id).toBe("pool-panel-offerings");
  });

  it("uses pool vouchers, wallet logos, and selected voucher balances in both swap fields", async () => {
    mockPoolRequests();
    renderWithQueryClient(<PoolSwapPage poolAddress={POOL_ADDRESS} />);

    const fromField = await screen.findByRole("group", { name: "From" });
    const toField = screen.getByRole("group", { name: "To" });

    expect(await within(fromField).findByText("USDC")).toBeTruthy();
    expect(await within(toField).findByText("TTX")).toBeTruthy();
    expect(await within(fromField).findByRole("button", { name: /max 12\.34/i })).toBeTruthy();
    expect(fromField.className).toBe(toField.className);
    expect(
      (within(fromField).getByRole("textbox", { name: "From" }) as HTMLElement).className,
    ).toBe((within(toField).getByRole("textbox", { name: "To" }) as HTMLElement).className);
    expect(fromField.parentElement?.className).toContain("grid-rows-2");
    expect(document.querySelector('img[src="https://wallet.example/usdc.png"]')).toBeTruthy();
    expect(document.querySelector('img[src="https://wallet.example/ttx.png"]')).toBeTruthy();
  });

  it("updates To from the real exact-input quote when From changes", async () => {
    mockPoolRequests();
    renderWithQueryClient(<PoolSwapPage poolAddress={POOL_ADDRESS} />);

    const fromInput = (await screen.findByRole("textbox", { name: "From" })) as HTMLInputElement;
    const toInput = screen.getByRole("textbox", { name: "To" }) as HTMLInputElement;
    fireEvent.change(fromInput, { target: { value: "10" } });

    await waitFor(() => expect(toInput.value).toBe("20.00"));
    expect(screen.getByText("1 USDC = 2.000 TTX")).toBeTruthy();
    const call = publicClientCall.mock.calls.at(-2)?.[0] as { to: string; data: Hex };
    expect(call.to).toBe("0x204653A89FF5F2A935c88b0c750cAcdaA9e7368d");
    expect(decodeFunctionData({ abi: swapRouterQuoteExactInputAbi, data: call.data }).args).toEqual(
      [[{ pool: POOL_ADDRESS, tokenIn: USDC_ADDRESS, tokenOut: TTX_ADDRESS }], 10_000_000n],
    );
  });

  it("quotes only the settled From amount while the user types", async () => {
    mockPoolRequests();
    renderWithQueryClient(<PoolSwapPage poolAddress={POOL_ADDRESS} />);

    const fromInput = (await screen.findByRole("textbox", { name: "From" })) as HTMLInputElement;
    const toInput = screen.getByRole("textbox", { name: "To" }) as HTMLInputElement;
    await waitFor(() => expect(toInput.value).toBe("50.00"));
    publicClientCall.mockClear();

    fireEvent.change(fromInput, { target: { value: "1" } });
    fireEvent.change(fromInput, { target: { value: "2" } });
    fireEvent.change(fromInput, { target: { value: "3" } });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(publicClientCall).not.toHaveBeenCalled();
    await waitFor(() => expect(toInput.value).toBe("6.00"));
    expect(publicClientCall).toHaveBeenCalledTimes(2);
  });

  it("updates From from the real exact-output quote when To changes", async () => {
    mockPoolRequests();
    renderWithQueryClient(<PoolSwapPage poolAddress={POOL_ADDRESS} />);

    const fromInput = (await screen.findByRole("textbox", { name: "From" })) as HTMLInputElement;
    const toInput = screen.getByRole("textbox", { name: "To" }) as HTMLInputElement;
    await waitFor(() => expect(toInput.value).toBe("50.00"));
    fireEvent.change(toInput, { target: { value: "8" } });

    await waitFor(() => {
      expect(fromInput.value).toBe("4.00");
      expect(toInput.value).toBe("8");
    });
    const call = publicClientCall.mock.calls.at(-2)?.[0] as { data: Hex };
    expect(
      decodeFunctionData({ abi: swapRouterQuoteExactOutputAbi, data: call.data }).args,
    ).toEqual([[{ pool: POOL_ADDRESS, tokenIn: USDC_ADDRESS, tokenOut: TTX_ADDRESS }], 8_000_000n]);
  });

  it("blocks a quoted swap when the pool has no output-token liquidity", async () => {
    poolLiquidityBalance.value = 0n;
    mockPoolRequests();
    renderWithQueryClient(<PoolSwapPage poolAddress={POOL_ADDRESS} />);

    const fromInput = (await screen.findByRole("textbox", { name: "From" })) as HTMLInputElement;
    fireEvent.change(fromInput, { target: { value: "1" } });

    expect(await screen.findByText(/this pool has no ttx available to swap/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /^swap$/i }).hasAttribute("disabled")).toBe(true);
  });

  it("shows the pool's available output liquidity when it cannot fill the quote", async () => {
    poolLiquidityBalance.value = 1_000_000n;
    mockPoolRequests();
    renderWithQueryClient(<PoolSwapPage poolAddress={POOL_ADDRESS} />);

    const fromInput = (await screen.findByRole("textbox", { name: "From" })) as HTMLInputElement;
    fireEvent.change(fromInput, { target: { value: "1" } });

    expect(await screen.findByText(/this pool only has 1\.00 ttx available to swap/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /^swap$/i }).hasAttribute("disabled")).toBe(true);
  });

  it("prevents swapping more than the selected From balance and Max requotes it", async () => {
    mockPoolRequests();
    renderWithQueryClient(<PoolSwapPage poolAddress={POOL_ADDRESS} />);

    const fromInput = (await screen.findByRole("textbox", { name: "From" })) as HTMLInputElement;
    const toInput = screen.getByRole("textbox", { name: "To" }) as HTMLInputElement;
    await waitFor(() => expect(toInput.value).toBe("50.00"));
    expect(screen.getByText(/amount exceeds your balance/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /^swap$/i }).hasAttribute("disabled")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /max 12\.34/i }));

    await waitFor(() => {
      expect(fromInput.value).toBe("12.34");
      expect(toInput.value).toBe("24.68");
      expect(screen.getByRole("button", { name: /^swap$/i }).hasAttribute("disabled")).toBe(false);
    });
  });

  it("opens an in-place confirmation sheet instead of a review page", async () => {
    mockPoolRequests();
    renderWithQueryClient(<PoolSwapPage poolAddress={POOL_ADDRESS} />);

    const fromInput = (await screen.findByRole("textbox", { name: "From" })) as HTMLInputElement;
    fireEvent.change(fromInput, { target: { value: "1" } });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^swap$/i }).hasAttribute("disabled")).toBe(false);
    });
    fireEvent.click(screen.getByRole("button", { name: /^swap$/i }));

    expect(screen.getByRole("heading", { name: /confirm swap/i })).toBeTruthy();
    expect(screen.getByText("1 USDC")).toBeTruthy();
    expect(screen.getByText("2.00 TTX")).toBeTruthy();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("signs the atomic pool batch and goes directly to the tracked receipt", async () => {
    mockPoolRequests();
    renderWithQueryClient(<PoolSwapPage poolAddress={POOL_ADDRESS} />);

    const fromInput = (await screen.findByRole("textbox", { name: "From" })) as HTMLInputElement;
    fireEvent.change(fromInput, { target: { value: "1" } });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^swap$/i }).hasAttribute("disabled")).toBe(false);
    });
    fireEvent.click(screen.getByRole("button", { name: /^swap$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^confirm swap$/i }));

    await waitFor(() => {
      expect(swapMutateAsync).toHaveBeenCalledWith({
        mode: "exact-input",
        senderAddress: "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d",
        path: [{ poolAddress: POOL_ADDRESS, tokenIn: USDC_ADDRESS, tokenOut: TTX_ADDRESS }],
        hopAmountIns: ["1000000"],
        includeAuthorization: false,
      });
    });
    expect(navigate).toHaveBeenCalledWith({
      to: "/pools/$poolAddress/swap/receipt",
      params: { poolAddress: POOL_ADDRESS },
      search: {
        trackingId: "swap-tracking-1",
        sendAmount: "1",
        sendSymbol: "USDC",
        receiveAmount: "2.00",
        receiveSymbol: "TTX",
        poolName: "Trade Pool",
      },
    });
  });

  it("relays the full raw voucher balance when Max is selected", async () => {
    mockPoolRequests({ usdcBalance: "12345678" });
    renderWithQueryClient(<PoolSwapPage poolAddress={POOL_ADDRESS} />);

    fireEvent.click(await screen.findByRole("button", { name: /max 12\.34/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^swap$/i }).hasAttribute("disabled")).toBe(false);
    });
    fireEvent.click(screen.getByRole("button", { name: /^swap$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^confirm swap$/i }));

    await waitFor(() => {
      expect(swapMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ hopAmountIns: ["12345678"] }),
      );
    });
  });

  it("relays the required From amount for an exact-output swap", async () => {
    mockPoolRequests();
    renderWithQueryClient(<PoolSwapPage poolAddress={POOL_ADDRESS} />);

    const toInput = (await screen.findByRole("textbox", { name: "To" })) as HTMLInputElement;
    fireEvent.change(toInput, { target: { value: "8" } });
    await waitFor(() => {
      expect((screen.getByRole("textbox", { name: "From" }) as HTMLInputElement).value).toBe(
        "4.00",
      );
      expect(screen.getByRole("button", { name: /^swap$/i }).hasAttribute("disabled")).toBe(false);
    });
    fireEvent.click(screen.getByRole("button", { name: /^swap$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^confirm swap$/i }));

    await waitFor(() => {
      expect(swapMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: "exact-output",
          hopAmountIns: ["4000000"],
        }),
      );
    });
    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "/pools/$poolAddress/swap/receipt",
        search: expect.objectContaining({ receiveAmount: "8", receiveSymbol: "TTX" }),
      }),
    );
  });

  it("rechecks pool liquidity before signing the batch", async () => {
    mockPoolRequests();
    renderWithQueryClient(<PoolSwapPage poolAddress={POOL_ADDRESS} />);

    const fromInput = (await screen.findByRole("textbox", { name: "From" })) as HTMLInputElement;
    fireEvent.change(fromInput, { target: { value: "1" } });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^swap$/i }).hasAttribute("disabled")).toBe(false);
    });
    fireEvent.click(screen.getByRole("button", { name: /^swap$/i }));
    poolLiquidityBalance.value = 0n;
    fireEvent.click(screen.getByRole("button", { name: /^confirm swap$/i }));

    expect(await screen.findByText(/pool liquidity changed/i)).toBeTruthy();
    expect(swapMutateAsync).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("keeps relay failures visible in the confirmation sheet", async () => {
    swapTransferState.error = new Error("Relay failed");
    mockPoolRequests();
    renderWithQueryClient(<PoolSwapPage poolAddress={POOL_ADDRESS} />);

    const fromInput = (await screen.findByRole("textbox", { name: "From" })) as HTMLInputElement;
    fireEvent.change(fromInput, { target: { value: "1" } });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^swap$/i }).hasAttribute("disabled")).toBe(false);
    });
    fireEvent.click(screen.getByRole("button", { name: /^swap$/i }));

    expect(screen.getByRole("alert").textContent).toMatch(/relay failed/i);
  });

  it("shows quote failures and prevents swapping an unquoted amount", async () => {
    publicClientCall.mockRejectedValue(new Error("RPC unavailable"));
    mockPoolRequests();
    renderWithQueryClient(<PoolSwapPage poolAddress={POOL_ADDRESS} />);

    expect(await screen.findByRole("alert", { name: /couldn't estimate this swap/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^swap$/i }).hasAttribute("disabled")).toBe(true);
  });

  it("reverses the selected vouchers without changing either amount", async () => {
    mockPoolRequests();
    renderWithQueryClient(<PoolSwapPage poolAddress={POOL_ADDRESS} />);

    const fromInput = (await screen.findByRole("textbox", { name: "From" })) as HTMLInputElement;
    const toInput = screen.getByRole("textbox", { name: "To" }) as HTMLInputElement;
    fireEvent.change(fromInput, { target: { value: "17.25" } });
    const amountsBefore = [fromInput.value, toInput.value];

    fireEvent.click(screen.getByRole("button", { name: /reverse swap direction/i }));

    expect(within(screen.getByRole("group", { name: "From" })).getByText("TTX")).toBeTruthy();
    expect(within(screen.getByRole("group", { name: "To" })).getByText("USDC")).toBeTruthy();
    expect([fromInput.value, toInput.value]).toEqual(amountsBefore);
    expect(
      within(screen.getByRole("group", { name: "From" })).getByRole("button", {
        name: /max 9/i,
      }),
    ).toBeTruthy();
  });
});
