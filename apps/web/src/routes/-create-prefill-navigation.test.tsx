/**
 * Real-router regressions for creation-prefill links: the route's own
 * `validateSearch` and `beforeLoad`, the prefill read off the location, step
 * navigation, publishing and the signed-out round trip through onboarding.
 */
import { parsePoolPrefill } from "@clc/core/features/pools/prefill";
import { parseVoucherPrefill, voucherPrefillHref } from "@clc/core/features/vouchers/prefill";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  auth: { signedIn: true },
  deployVoucher: vi.fn(),
  deployPool: vi.fn(),
}));

vi.mock("wagmi", () => ({
  useConnection: () => ({
    address: "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d",
    chainId: 100,
  }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({
    isAuthenticated: mocks.auth.signedIn,
    isLoading: false,
    state: mocks.auth.signedIn ? "authenticated" : "unauthenticated",
    session: mocks.auth.signedIn ? { address: "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d" } : null,
    retry: vi.fn(),
    retrying: false,
  }),
}));
vi.mock("#/components/ui/location-picker", () => ({
  LocationPicker: ({ value }: { value?: { locationName: string } }) => (
    <output data-testid="location">{value?.locationName ?? "none"}</output>
  ),
}));
vi.mock("#/features/vouchers/hooks/use-voucher-deployment", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useDeployVoucher: () => ({ error: null, isPending: false, mutateAsync: mocks.deployVoucher }),
}));
vi.mock("#/features/pools/hooks/use-pool-deployment", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useDeployPool: () => ({ error: null, isPending: false, mutateAsync: mocks.deployPool }),
}));
vi.mock("#/features/auth/hooks/use-profile", () => ({
  useAuthProfile: () => ({ data: { email: "", phone: "" } }),
}));
vi.mock("#/hooks/use-resource-usage", () => ({
  useResourceUsage: () => ({
    data: {
      vouchers: { used: 0, limit: 1, canCreate: true, unlimited: false },
      pools: { used: 0, limit: 1, canCreate: true, unlimited: false },
    },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("#/hooks/use-deployment", () => ({
  useTokenTags: () => ({ data: [], isError: false, isPending: false, refetch: vi.fn() }),
}));
vi.mock("#/lib/api/storage", () => ({ isStorageConfigured: false, storageClient: () => ({}) }));
vi.mock("#/lib/api/symbols", () => ({
  symbolsClient: {
    getTakenSymbols: vi.fn(async (kind: string, prefix: string) => ({ kind, prefix, taken: [] })),
  },
}));
vi.mock("#/lib/api/names", () => ({
  namesClient: {
    getNameAvailability: vi.fn(async (kind: string, name: string) => ({
      kind,
      name,
      available: true,
    })),
  },
}));

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { CreatePoolFlow, type PoolCreateStep } from "#/features/pools/ui";
import { CreateVoucherFlow, type VoucherCreateStep } from "#/features/vouchers/ui";
import { usePoolCreateDraft } from "#/features/pools/state/pool-create-draft";
import { useVoucherCreateDraft } from "#/features/vouchers/state/voucher-create-draft";
import { carriesPrefill, useCreatePrefill } from "#/lib/navigation/create-prefill";
import { resetPoolCreateHistory } from "#/lib/navigation/pool-create-history";
import { resetVoucherCreateHistory } from "#/lib/navigation/voucher-create-history";
import { parseOnboardingSearch } from "#/lib/onboarding-search";
import { clearViewDrafts } from "#/lib/view-drafts";

import { Route as PoolCreateRoute } from "./pools/create/$step";
import { Route as VoucherCreateRoute } from "./vouchers/create/$step";

const LINK = voucherPrefillHref({
  name: "Mama Mboga",
  description: "Fresh vegetables from Kibera.",
  price: "50",
  supply: "1000",
  symbol: "MMB",
  location: { locationName: "Kibera", lat: -1.3133, lng: 36.7876, country: "KE" },
});

type StepGuard = (ctx: { params: { step: string }; search: Record<string, unknown> }) => void;

async function renderApp(initialEntries: string[]) {
  const rootRoute = createRootRoute({ component: Outlet });
  const walletRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/wallet/vouchers",
    component: () => <h1>All vouchers</h1>,
  });
  const receiptRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/vouchers/create/receipt",
    component: () => <h1>Voucher receipt</h1>,
  });
  // The real route's search contract and step guard, around the phone flow
  // the route renders (the layout switch has its own suite).
  const voucherRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/vouchers/create/$step",
    validateSearch: (search: Record<string, unknown>) =>
      (VoucherCreateRoute.options.validateSearch as (input: unknown) => Record<string, unknown>)(
        search,
      ),
    beforeLoad: ({ params, search }) =>
      (VoucherCreateRoute.options.beforeLoad as unknown as StepGuard)({ params, search }),
    component: function VoucherStep() {
      const { step } = voucherRoute.useParams();
      const prefill = useCreatePrefill(parseVoucherPrefill);
      return (
        <AuthenticatedRoute>
          <CreateVoucherFlow step={step as VoucherCreateStep} prefill={prefill} />
        </AuthenticatedRoute>
      );
    },
  });
  const poolRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/pools/create/$step",
    validateSearch: (search: Record<string, unknown>) =>
      (PoolCreateRoute.options.validateSearch as (input: unknown) => Record<string, unknown>)(
        search,
      ),
    beforeLoad: ({ params, search }) =>
      (PoolCreateRoute.options.beforeLoad as unknown as StepGuard)({ params, search }),
    component: function PoolStep() {
      const { step } = poolRoute.useParams();
      const prefill = useCreatePrefill(parsePoolPrefill);
      return <CreatePoolFlow step={step as PoolCreateStep} prefill={prefill} />;
    },
  });
  // Stands in for sign-in: it finishes by replacing itself with the redirect.
  const onboardingRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/onboarding",
    validateSearch: parseOnboardingSearch,
    component: function Onboarding() {
      const { redirect } = useSearch({ from: "/onboarding" });
      const navigate = useNavigate();
      return (
        <button
          type="button"
          onClick={() => {
            mocks.auth.signedIn = true;
            void navigate({ href: redirect ?? "/", replace: true });
          }}
        >
          Finish sign-in
        </button>
      );
    },
  });

  const history = createMemoryHistory({ initialEntries });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      walletRoute,
      receiptRoute,
      voucherRoute,
      poolRoute,
      onboardingRoute,
    ]),
    history,
  });
  await router.load();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { history, router };
}

const nameField = () => screen.getByLabelText("Voucher Name") as HTMLInputElement;

beforeEach(() => {
  mocks.auth.signedIn = true;
  mocks.deployVoucher.mockResolvedValue({ trackingId: "track-1" });
  resetVoucherCreateHistory();
  resetPoolCreateHistory();
  clearViewDrafts();
  useVoucherCreateDraft.getState().clearDraft();
  usePoolCreateDraft.getState().clearDraft();
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
});

afterEach(() => {
  resetVoucherCreateHistory();
  resetPoolCreateHistory();
  vi.restoreAllMocks();
});

describe("creation-prefill links", () => {
  it("seeds step 1 and leaves the link as it arrived, so a reload seeds it again", async () => {
    const { router } = await renderApp(["/wallet/vouchers", LINK]);

    await screen.findByRole("heading", { name: "Create voucher" });
    expect(nameField().value).toBe("Mama Mboga");
    expect(`${router.state.location.pathname}${router.state.location.searchStr}`).toBe(LINK);
  });

  it("keeps a rejected field and an unread param in the URL untouched", async () => {
    const { router } = await renderApp([`${LINK}&markerIcon=rocket&utm_source=migration`]);

    await screen.findByRole("heading", { name: "Create voucher" });
    expect(nameField().value).toBe("Mama Mboga");
    const params = new URLSearchParams(router.state.location.searchStr);
    expect(params.get("markerIcon")).toBe("rocket");
    expect(params.get("price")).toBe('"50"');
    expect(params.get("utm_source")).toBe("migration");
  });

  it("drops the params on Next", async () => {
    const { router } = await renderApp(["/wallet/vouchers", LINK]);
    await screen.findByRole("heading", { name: "Create voucher" });

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await screen.findByRole("heading", { name: "Where and what for" });
    expect(router.state.location.pathname).toBe("/vouchers/create/place");
    expect(router.state.location.searchStr).toBe("");
  });

  it("sends a later step carrying a prefill to step 1 with the same search", async () => {
    const review = LINK.replace("/vouchers/create/voucher", "/vouchers/create/review");
    const { router } = await renderApp([review]);

    await screen.findByRole("heading", { name: "Create voucher" });
    expect(router.state.location.pathname).toBe("/vouchers/create/voucher");
    expect(router.state.location.searchStr).toBe(LINK.slice(LINK.indexOf("?")));
    expect(nameField().value).toBe("Mama Mboga");
  });

  it("sends a later pool step carrying a prefill to step 1", async () => {
    const { router } = await renderApp(["/pools/create/review?v=1&name=Kibera+Growers"]);

    await screen.findByRole("heading", { name: "Create pool" });
    expect(router.state.location.pathname).toBe("/pools/create/pool");
    expect((screen.getByLabelText("Pool Name") as HTMLInputElement).value).toBe("Kibera Growers");
  });

  it("does not reopen the prefilled form on Back after publishing", async () => {
    const { history } = await renderApp(["/wallet/vouchers", LINK]);
    await screen.findByRole("heading", { name: "Create voucher" });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByRole("heading", { name: "Where and what for" });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByRole("heading", { name: "Confirm & publish" });
    fireEvent.click(screen.getAllByRole("checkbox").at(-1) as HTMLElement);
    fireEvent.click(screen.getByRole("button", { name: /Confirm (&|and) Publish/i }));

    await screen.findByRole("heading", { name: "Voucher receipt" });
    expect(mocks.deployVoucher).toHaveBeenCalledTimes(1);

    history.back();
    await screen.findByRole("heading", { name: "All vouchers" });
    expect(history.location.pathname).toBe("/wallet/vouchers");
  });

  it("keeps the retry snapshot a prefilled voucher publish wrote when the deploy fails", async () => {
    mocks.deployVoucher.mockRejectedValue(new Error("relay down"));
    await renderApp(["/wallet/vouchers", LINK]);
    await screen.findByRole("heading", { name: "Create voucher" });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByRole("heading", { name: "Where and what for" });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByRole("heading", { name: "Confirm & publish" });
    fireEvent.click(screen.getAllByRole("checkbox").at(-1) as HTMLElement);
    fireEvent.click(screen.getByRole("button", { name: /Confirm (&|and) Publish/i }));

    await waitFor(() => expect(mocks.deployVoucher).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(useVoucherCreateDraft.getState().draft).toMatchObject({
        name: "Mama Mboga",
        price: "50",
      }),
    );
  });

  it("keeps the retry snapshot a prefilled pool publish wrote when the deploy fails", async () => {
    mocks.deployPool.mockRejectedValue(new Error("relay down"));
    await renderApp([
      "/pools/create/pool?v=1&name=Kibera+Growers&symbol=KBG&description=Growers+in+Kibera." +
        "&locationName=Kibera&lat=-1.3133&lng=36.7876&country=KE",
    ]);
    await screen.findByRole("heading", { name: "Create pool" });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByRole("heading", { name: "Where and what for" });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    const terms = await screen.findByRole("checkbox", { name: /Accept Terms/ });
    fireEvent.click(terms);
    fireEvent.click(screen.getByRole("button", { name: /Confirm (&|and) Publish/i }));

    await waitFor(() => expect(mocks.deployPool).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(usePoolCreateDraft.getState().draft).toMatchObject({ name: "Kibera Growers" }),
    );
  });

  it("brings a signed-out person back to a prefilled step 1 after sign-in", async () => {
    mocks.auth.signedIn = false;
    const { router } = await renderApp([LINK]);

    const createAccount = await screen.findByRole("link", { name: "Create account" });
    fireEvent.click(createAccount);
    const finish = await screen.findByRole("button", { name: "Finish sign-in" });
    expect(parseOnboardingSearch(router.state.location.search).redirect).toBe(LINK);

    fireEvent.click(finish);

    await screen.findByRole("heading", { name: "Create voucher" });
    expect(`${router.state.location.pathname}${router.state.location.searchStr}`).toBe(LINK);
    expect(nameField().value).toBe("Mama Mboga");
  });
});

describe("the route's step guard", () => {
  it("redirects an unknown step, and a later step only when it carries a prefill", () => {
    const beforeLoad = VoucherCreateRoute.options.beforeLoad as (ctx: {
      params: { step: string };
      search: Record<string, unknown>;
    }) => void;

    expect(() => beforeLoad({ params: { step: "review" }, search: {} })).not.toThrow();
    expect(() => beforeLoad({ params: { step: "voucher" }, search: { v: 1 } })).not.toThrow();
    expect(() => beforeLoad({ params: { step: "place" }, search: { v: 1 } })).toThrow();
    expect(carriesPrefill({ v: 1 })).toBe(true);
    expect(carriesPrefill({})).toBe(false);
  });

  it("waits for the flow before the step guard sends an empty later step back", async () => {
    const { router } = await renderApp(["/vouchers/create/review"]);

    await waitFor(() => expect(router.state.location.pathname).toBe("/vouchers/create/voucher"));
  });
});
