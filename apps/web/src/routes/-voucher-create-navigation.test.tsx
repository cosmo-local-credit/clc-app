/**
 * Real-router regression for voucher creation.
 *
 * The three steps share one `useForm` instance, which only survives because a
 * `$step` param change re-renders the route component instead of remounting it.
 * Driving the real router (not `rerender`) is what keeps that guarantee honest.
 */
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  isRedirect,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { resetVoucherCreateHistory } from "#/lib/navigation/voucher-create-history";

vi.mock("wagmi", () => ({
  useConnection: () => ({ address: "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d" }),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock("#/components/auth/authenticated-route", () => ({
  AuthenticatedRoute: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("#/components/ui/location-picker", () => ({
  LocationPicker: ({
    value,
    onChange,
  }: {
    value?: { locationName: string };
    onChange: (value: { locationName: string; country: string; lat: number; lng: number }) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onChange({ locationName: "Kilifi, Kenya", country: "KE", lat: -3.5107, lng: 39.9093 })
      }
    >
      {value?.locationName ?? "Choose Kilifi, Kenya"}
    </button>
  ),
}));

vi.mock("#/features/vouchers/hooks/use-voucher-deployment", () => ({
  useDeployVoucher: () => ({ error: null, isPending: false, mutateAsync: vi.fn() }),
}));

vi.mock("#/features/auth/hooks/use-profile", () => ({
  useAuthProfile: () => ({ data: { email: "", phone: "" } }),
}));

vi.mock("#/hooks/use-deployment", () => ({
  useTokenTags: () => ({
    data: ["Agriculture"],
    isError: false,
    isPending: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("#/lib/api/storage", () => ({ isStorageConfigured: false }));

vi.mock("#/lib/api/symbols", () => ({
  symbolsClient: {
    getTakenSymbols: vi.fn(async (kind: string, prefix: string) => ({ kind, prefix, taken: [] })),
  },
}));

import { CreateVoucherFlow, type VoucherCreateStep } from "#/features/vouchers/ui";

async function renderFlow() {
  const rootRoute = createRootRoute({ component: Outlet });
  const vouchersRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/wallet/vouchers",
    component: () => <div data-testid="all-vouchers">All Vouchers</div>,
  });
  const createRouteDef = createRoute({
    getParentRoute: () => rootRoute,
    path: "/vouchers/create/$step",
    component: function CreateStep() {
      const { step } = createRouteDef.useParams();
      return <CreateVoucherFlow step={step as VoucherCreateStep} />;
    },
  });

  const history = createMemoryHistory({
    initialEntries: ["/wallet/vouchers", "/vouchers/create/voucher"],
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([vouchersRoute, createRouteDef]),
    history,
  });

  await router.load();
  // The create flow reads symbol occupancy through the query cache.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { history, router };
}

beforeEach(() => {
  resetVoucherCreateHistory();
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
});

afterEach(() => {
  resetVoucherCreateHistory();
  vi.restoreAllMocks();
});

describe("voucher create navigation", () => {
  it("carries entered values through real step navigation and back", async () => {
    const { history } = await renderFlow();

    fireEvent.change(screen.getByLabelText("Voucher Name"), {
      target: { value: "Kilifi Harvest" },
    });
    fireEvent.change(screen.getByLabelText("Voucher Symbol"), { target: { value: "khv" } });
    fireEvent.change(screen.getByLabelText("Voucher Description"), {
      target: { value: "Fresh food from Kilifi producers." },
    });
    fireEvent.change(screen.getByLabelText("Create vouchers"), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await screen.findByRole("heading", { name: "Where and what for" });
    fireEvent.click(screen.getByRole("button", { name: "Choose Kilifi, Kenya" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await screen.findByRole("heading", { name: "Confirm & publish" });
    expect(screen.getByText("Kilifi Harvest")).toBeTruthy();
    expect(screen.getByText("KHV")).toBeTruthy();
    expect(screen.getByText("Kilifi, Kenya")).toBeTruthy();

    history.back();
    await screen.findByRole("heading", { name: "Where and what for" });
    expect(screen.getByRole("button", { name: "Kilifi, Kenya" })).toBeTruthy();

    history.back();
    await screen.findByRole("heading", { name: "Create voucher" });
    expect((screen.getByLabelText("Voucher Name") as HTMLInputElement).value).toBe(
      "Kilifi Harvest",
    );
  });

  it("uses the first Back press to close an open tag search", async () => {
    const { history } = await renderFlow();

    fireEvent.change(screen.getByLabelText("Voucher Name"), {
      target: { value: "Kilifi Harvest" },
    });
    fireEvent.change(screen.getByLabelText("Voucher Symbol"), { target: { value: "KHV" } });
    fireEvent.change(screen.getByLabelText("Voucher Description"), {
      target: { value: "Fresh food from Kilifi producers." },
    });
    fireEvent.change(screen.getByLabelText("Create vouchers"), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await screen.findByRole("heading", { name: "Where and what for" });
    fireEvent.click(screen.getByRole("combobox", { name: "Search voucher tags" }));
    expect(screen.getByRole("option", { name: "Agriculture" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.queryByRole("option", { name: "Agriculture" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Where and what for" })).toBeTruthy();
    expect(history.location.pathname).toBe("/vouchers/create/place");

    fireEvent.click(screen.getByRole("link", { name: "Back" }));
    await screen.findByRole("heading", { name: "Create voucher" });
  });

  it("redirects an unknown step to the first step before the flow loads", async () => {
    const { Route } = await import("./vouchers/create/$step");
    const beforeLoad = Route.options.beforeLoad as (ctx: { params: { step: string } }) => void;

    expect(() => beforeLoad({ params: { step: "review" } })).not.toThrow();
    try {
      beforeLoad({ params: { step: "not-a-step" } });
      expect.unreachable("expected a redirect");
    } catch (error) {
      expect(isRedirect(error)).toBe(true);
      expect((error as { options: { params: { step: string } } }).options.params.step).toBe(
        "voucher",
      );
    }
  });
});
