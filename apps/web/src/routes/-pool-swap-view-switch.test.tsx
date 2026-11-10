import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

/**
 * Pool swap across a browser zoom or window resize that crosses the desktop
 * breakpoint: the real `LayoutSwitch` swaps the phone swap screen for the
 * desktop swap column (and back) while a confirmed swap is still relaying. The
 * swap mutation is the real one, so its cache entry outlives the view that
 * started it; only the chain reads and the relay itself are stood in for.
 */
const POOL = "0x1111111111111111111111111111111111111111";
const TTX = "0x2222222222222222222222222222222222222222";
const RAMBO = "0x3333333333333333333333333333333333333333";

const mocks = vi.hoisted(() => {
  const quoteData = {
    amount: "25.00",
    amountRaw: "25000000",
    amountInRaw: "25000000",
    amountOutRaw: "50000000",
    availableAmountOut: "1000.00",
    availableAmountOutRaw: "1000000000",
    grossAmountOutRaw: "50000000",
    feeBreakdown: {
      grossAmountOutRaw: "50000000",
      poolFeeRaw: "0",
      protocolFeeRaw: "0",
      totalFeeRaw: "0",
    },
    hasLiquidity: true,
    depositHeadroomRaw: null,
    exceedsDepositCap: false,
    blockNumber: 100n,
  };
  return {
    navigate: vi.fn(),
    relay: vi.fn(),
    /** Settles the relay the last confirm started. */
    settle: undefined as undefined | ((value: unknown) => void),
    quoteData,
  };
});

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useRouter: () => ({ history: { back: vi.fn() } }),
  useCanGoBack: () => false,
  useNavigate: () => mocks.navigate,
}));
vi.mock("wagmi", () => ({
  useConnection: () => ({ address: "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d" }),
}));
vi.mock("#/features/webauthn/hooks/use-calibur-delegation", () => ({
  useCaliburDelegation: () => "delegated",
}));
vi.mock("#/features/pools/hooks/use-user-pools", () => ({
  useUserPoolByAddress: () => ({
    data: { address: POOL, name: "Trade Pool", symbol: "TRD" },
    isError: false,
    isLoading: false,
    isFetching: false,
    refetch: () => Promise.resolve(),
  }),
}));
vi.mock("#/features/pools/hooks/use-pool-swap-vouchers", () => ({
  usePoolSwapVouchers: () => ({
    vouchers: [
      {
        id: "1",
        tokenAddress: TTX,
        name: "Trade Token",
        symbol: "TTX",
        decimals: 6,
        iconUrl: null,
        tokenLimit: null,
      },
      {
        id: "2",
        tokenAddress: RAMBO,
        name: "Rambo Token",
        symbol: "RAMBO",
        decimals: 6,
        iconUrl: null,
        tokenLimit: null,
      },
    ],
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: () => Promise.resolve(),
  }),
}));
vi.mock("#/features/pools/hooks/use-pool-swap-tokens", () => ({
  usePoolSwapTokenReads: () => ({
    data: new Map([
      [TTX, { holderBalanceRaw: "100000000", poolBalanceRaw: "500000000", feesRaw: "0" }],
      [RAMBO, { holderBalanceRaw: "1000000000", poolBalanceRaw: "500000000", feesRaw: "0" }],
    ]),
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: () => Promise.resolve(),
  }),
}));
vi.mock("#/features/pools/hooks/use-pool-swap-quote", () => ({
  usePoolSwapQuote: () => ({
    data: mocks.quoteData,
    error: null,
    isDebouncing: false,
    isError: false,
    isFetching: false,
    isPlaceholderData: false,
    refetch: () => Promise.resolve({ data: mocks.quoteData, isError: false }),
  }),
}));
vi.mock("#/features/pools/hooks/use-pool-swap-maximum", () => ({
  usePoolSwapMaximum: () => ({ data: undefined, isFetching: false, isPlaceholderData: false }),
}));
vi.mock("#/features/wallet/api/pool-swap-relay", () => ({
  relayPoolSwapExactInput: mocks.relay,
  relayPoolSwapExactOutput: mocks.relay,
}));
vi.mock("@clc/api/features/relayer/client", () => ({
  createRelayerClient: () => ({ kind: "test-relayer" }),
}));

import { DESKTOP_MEDIA } from "#/desktop/layout";
import { PoolSwapColumn } from "#/desktop/pools/pool-swap-column";
import { LayoutSwitch } from "#/desktop/switch";
import { PoolSwapPage } from "#/features/pools/ui";

const originalMatchMedia = window.matchMedia;
const media = { matches: false, listeners: new Set<() => void>() };

function setViewport(desktop: boolean) {
  act(() => {
    media.matches = desktop;
    for (const listener of media.listeners) listener();
  });
}

/** A viewport the layout bootstrap has already classified, as on a real page load. */
function openViewport(desktop: boolean) {
  media.matches = desktop;
  document.documentElement.dataset.layout = desktop ? "desktop" : "mobile";
}

function renderSwap() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <LayoutSwitch
        mobile={<PoolSwapPage poolAddress={POOL} />}
        desktop={<PoolSwapColumn poolAddress={POOL} />}
      />
    </QueryClientProvider>,
  );
}

const swapButton = () => screen.getByRole("button", { name: /^swap$/i });

async function enterReceiveAmount() {
  fireEvent.change(await screen.findByRole("textbox", { name: "You receive" }), {
    target: { value: "50" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.settle = undefined;
  mocks.relay.mockImplementation(
    () =>
      new Promise((resolve) => {
        mocks.settle = resolve;
      }),
  );
  media.matches = false;
  media.listeners.clear();
  vi.stubGlobal("matchMedia", (query: string) => ({
    media: query,
    get matches() {
      return query === DESKTOP_MEDIA && media.matches;
    },
    addEventListener: (_: string, listener: () => void) => media.listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => media.listeners.delete(listener),
  }));
});

afterEach(() => {
  // Put back only matchMedia: the setup file's other stubs (ResizeObserver) must stay.
  vi.stubGlobal("matchMedia", originalMatchMedia);
  delete document.documentElement.dataset.layout;
});

describe("Pool swap across a phone/desktop view switch", () => {
  it.each([false, true])(
    "keeps Swap busy in the other view until the relaying swap settles (starting desktop: %s)",
    async (desktop) => {
      openViewport(desktop);
      renderSwap();

      await enterReceiveAmount();
      await waitFor(() => expect(swapButton().hasAttribute("disabled")).toBe(false));
      fireEvent.click(swapButton());
      fireEvent.click(screen.getByRole("button", { name: /^confirm swap$/i }));
      await waitFor(() => expect(mocks.relay).toHaveBeenCalledTimes(1));

      setViewport(!desktop);

      // The arriving view has a sized, quoted swap of its own, so only the swap
      // still relaying from the view that left can hold its Swap back.
      await enterReceiveAmount();
      expect(swapButton().hasAttribute("disabled")).toBe(true);
      expect(swapButton().getAttribute("aria-busy")).toBe("true");
      fireEvent.click(swapButton());
      expect(screen.queryByRole("button", { name: /^confirm swap$/i })).toBeNull();

      await act(async () => {
        mocks.settle?.({ trackingId: "swap-tracking-1", valuationSnapshots: [] });
      });

      // The view that started the swap still takes the holder to its receipt.
      expect(mocks.navigate).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "/pools/$poolAddress/swap/receipt",
          search: expect.objectContaining({ trackingId: "swap-tracking-1" }),
        }),
      );
      await waitFor(() => expect(swapButton().hasAttribute("disabled")).toBe(false));
      expect(swapButton().hasAttribute("aria-busy")).toBe(false);
      expect(mocks.relay).toHaveBeenCalledTimes(1);
    },
  );
});
