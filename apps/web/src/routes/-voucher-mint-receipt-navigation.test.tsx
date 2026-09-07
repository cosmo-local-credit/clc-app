import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const { mintMock } = vi.hoisted(() => ({
  mintMock: vi.fn().mockResolvedValue({ trackingId: "mint-1", signatureType: "webauthn" }),
}));

vi.mock("wagmi", () => ({
  useConnection: () => ({ address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" }),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock("#/features/webauthn/hooks/use-calibur-delegation", () => ({
  useCaliburDelegation: () => "delegated",
}));

vi.mock("#/features/vouchers/hooks/use-voucher-mint", () => ({
  useVoucherMint: () => ({ mutateAsync: mintMock, isPending: false }),
}));

vi.mock("#/features/home/hooks/use-market-voucher-detail", () => ({
  useMarketVoucherDetail: () => ({ data: undefined }),
}));

vi.mock("#/features/vouchers/hooks/use-voucher-supply", () => ({
  useVoucherSupply: () => ({
    data: "0",
    error: null,
    isError: false,
    isPending: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("#/features/auth/hooks/use-otx-tracking", () => ({
  useOtxTracking: (_trackingId: string | null, options?: { queryKey?: string }) => ({
    outcome:
      options?.queryKey === "voucher-mint-track"
        ? { kind: "pending" }
        : { kind: "success", otx: { txHash: "0xdeploy" } },
    error: null,
    isError: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("#/hooks/use-deployment", () => ({
  useDeploymentContract: () => ({
    data: {
      address: "0x7C41ba09E8d5A62f3b0D14eC7a9F26B8d3510Ee4",
      admin: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
      name: "Kilifi Harvest",
      symbol: "KHV",
      status: "CONFIRMED",
      decimals: 6,
    },
    error: null,
    isError: false,
  }),
}));

import { VoucherDeploymentReceiptPage } from "#/features/vouchers/ui";

afterEach(() => {
  vi.clearAllMocks();
});

describe("voucher mint receipt navigation", () => {
  it("replaces the pre-mint receipt so Back returns to review", async () => {
    const rootRoute = createRootRoute({ component: Outlet });
    const reviewRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/vouchers/create/review",
      component: () => <h1>Voucher review</h1>,
    });
    const receiptRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/vouchers/create/receipt",
      validateSearch: (
        search,
      ): {
        trackingId?: string;
        mintTrackingId?: string;
        mintAmount?: string;
      } => ({
        trackingId: typeof search.trackingId === "string" ? search.trackingId : undefined,
        mintTrackingId:
          typeof search.mintTrackingId === "string" ? search.mintTrackingId : undefined,
        mintAmount: typeof search.mintAmount === "string" ? search.mintAmount : undefined,
      }),
      component: function Receipt() {
        const search = receiptRoute.useSearch();
        return <VoucherDeploymentReceiptPage {...search} />;
      },
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([reviewRoute, receiptRoute]),
      history: createMemoryHistory({
        initialEntries: ["/vouchers/create/review", "/vouchers/create/receipt?trackingId=deploy-1"],
      }),
    });
    await router.load();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    fireEvent.change(await screen.findByLabelText("Create vouchers"), {
      target: { value: "500" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Mint supply" }));

    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({
        trackingId: "deploy-1",
        mintTrackingId: "mint-1",
        mintAmount: "500",
      }),
    );

    router.history.back();
    expect(await screen.findByRole("heading", { name: "Voucher review" })).toBeTruthy();
  });
});
