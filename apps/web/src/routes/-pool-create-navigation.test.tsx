import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  isRedirect,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { resetPoolCreateHistory } from "#/lib/navigation/pool-create-history";

vi.mock("wagmi", () => ({
  useConnection: () => ({
    address: "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d",
    chainId: 42220,
  }),
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

vi.mock("#/features/pools/hooks/use-pool-deployment", () => ({
  useDeployPool: () => ({ error: null, isPending: false, mutateAsync: vi.fn() }),
}));

vi.mock("#/features/auth/hooks/use-profile", () => ({
  useAuthProfile: () => ({ data: undefined }),
}));

// This suite is about navigation, not uploads: without a storage service the
// place step renders no image fields, which is one less thing to mock.
vi.mock("#/lib/api/storage", () => ({ isStorageConfigured: false }));

vi.mock("#/hooks/use-deployment", () => ({
  useTokenTags: () => ({
    data: ["Agriculture"],
    isError: false,
    isPending: false,
    refetch: vi.fn(),
  }),
}));

import { CreatePoolFlow, type PoolCreateStep } from "#/features/pools/ui";
import { usePoolCreateDraft } from "#/features/pools/state/pool-create-draft";

async function renderFlow() {
  const rootRoute = createRootRoute({ component: Outlet });
  const poolsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/pools",
    component: () => <div data-testid="pools-list">Pools</div>,
  });
  const createRouteDef = createRoute({
    getParentRoute: () => rootRoute,
    path: "/pools/create/$step",
    component: function CreateStep() {
      const { step } = createRouteDef.useParams();
      return <CreatePoolFlow step={step as PoolCreateStep} />;
    },
  });

  const history = createMemoryHistory({
    initialEntries: ["/pools", "/pools/create/pool"],
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([poolsRoute, createRouteDef]),
    history,
  });

  await router.load();
  render(<RouterProvider router={router} />);
  return { history };
}

beforeEach(() => {
  resetPoolCreateHistory();
  usePoolCreateDraft.getState().clearDraft();
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
});

afterEach(() => {
  resetPoolCreateHistory();
  usePoolCreateDraft.getState().clearDraft();
  vi.restoreAllMocks();
});

describe("pool create navigation", () => {
  it("carries entered values through real step navigation and browser Back", async () => {
    const { history } = await renderFlow();

    fireEvent.change(screen.getByLabelText("Pool Name"), {
      target: { value: "Kilifi Growers" },
    });
    fireEvent.change(screen.getByLabelText("Pool Shortcode"), { target: { value: "kgp1" } });
    fireEvent.change(screen.getByLabelText("Pool Description"), {
      target: { value: "A pool for Kilifi growers." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await screen.findByRole("heading", { name: "Where and what for" });
    fireEvent.click(screen.getByRole("button", { name: "Choose Kilifi, Kenya" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await screen.findByRole("heading", { name: "Confirm & publish" });
    expect(screen.getByText("Kilifi Growers")).toBeTruthy();
    expect(screen.getByText("KGP1")).toBeTruthy();

    history.back();
    await screen.findByRole("heading", { name: "Where and what for" });
    expect(screen.getByRole("button", { name: "Kilifi, Kenya" })).toBeTruthy();

    history.back();
    await screen.findByRole("heading", { name: "Create pool" });
    expect((screen.getByLabelText("Pool Name") as HTMLInputElement).value).toBe("Kilifi Growers");
  });

  it("uses the first Back press to close an open tag search", async () => {
    const { history } = await renderFlow();

    fireEvent.change(screen.getByLabelText("Pool Name"), {
      target: { value: "Kilifi Growers" },
    });
    fireEvent.change(screen.getByLabelText("Pool Shortcode"), { target: { value: "KGP1" } });
    fireEvent.change(screen.getByLabelText("Pool Description"), {
      target: { value: "A pool for Kilifi growers." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await screen.findByRole("heading", { name: "Where and what for" });
    fireEvent.click(screen.getByRole("combobox", { name: "Search pool tags" }));
    expect(screen.getByRole("option", { name: "Agriculture" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.queryByRole("option", { name: "Agriculture" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Where and what for" })).toBeTruthy();
    expect(history.location.pathname).toBe("/pools/create/place");

    fireEvent.click(screen.getByRole("link", { name: "Back" }));
    await screen.findByRole("heading", { name: "Create pool" });
  });

  it("redirects an unknown pool step before the flow loads", async () => {
    const { Route } = await import("./pools/create/$step");
    const beforeLoad = Route.options.beforeLoad as (ctx: { params: { step: string } }) => void;

    expect(() => beforeLoad({ params: { step: "review" } })).not.toThrow();
    try {
      beforeLoad({ params: { step: "unknown" } });
      expect.unreachable("expected a redirect");
    } catch (error) {
      expect(isRedirect(error)).toBe(true);
      expect((error as { options: { params: { step: string } } }).options.params.step).toBe("pool");
    }
  });
});
