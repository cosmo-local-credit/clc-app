import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useSearch,
} from "@tanstack/react-router";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { BottomNavigation } from "#/components/navigation/bottom-navigation";
import { Route as HomeRoute } from "#/routes/_nav/index";
import { Route as MarketRoute } from "#/routes/_nav/market/index";
import { writePostTimingPreference } from "./catalog-filter-preference-storage";
import { parseHomeTab } from "./home-tabs";
import { usePostTiming } from "./use-post-timing";

function PostsFixture() {
  const { timing, setTiming } = usePostTiming("guest");
  const search = useSearch({ strict: false });
  const tab = parseHomeTab(search.tab);
  return (
    <>
      <output aria-label="Selected period">{timing}</output>
      <button type="button" onClick={() => setTiming("past")}>
        Use past
      </button>
      <BottomNavigation activeTab={tab} atActiveTabRoot isMarketMap={tab === "market"} />
    </>
  );
}

async function renderPosts(initialEntry: string) {
  const root = createRootRoute({ component: Outlet });
  const home = createRoute({
    getParentRoute: () => root,
    path: "/",
    validateSearch: HomeRoute.options.validateSearch,
    beforeLoad: (context) => HomeRoute.options.beforeLoad?.(context as never),
    component: PostsFixture,
  });
  const market = createRoute({
    getParentRoute: () => root,
    path: "/market",
    validateSearch: MarketRoute.options.validateSearch,
    beforeLoad: (context) => MarketRoute.options.beforeLoad?.(context as never),
    component: PostsFixture,
  });
  const history = createMemoryHistory({ initialEntries: [initialEntry] });
  const router = createRouter({ routeTree: root.addChildren([home, market]), history });
  await router.load();
  const view = render(<RouterProvider router={router} />);
  await screen.findByLabelText("Selected period");
  return { ...view, history };
}

afterEach(() => {
  window.localStorage.clear();
});

describe("Post timing navigation", () => {
  it("keeps an explicit Past link ahead of a saved All preference", async () => {
    writePostTimingPreference("guest", "all");
    const { history } = await renderPosts("/?tab=posts&timing=past");

    await waitFor(() => expect(screen.getByLabelText("Selected period").textContent).toBe("past"));
    expect(new URLSearchParams(history.location.search).get("timing")).toBe("past");
  });

  it("shares a selected Past filter with someone whose preference is All", async () => {
    const view = await renderPosts("/?tab=posts&timing=all");
    fireEvent.click(screen.getByRole("button", { name: "Use past" }));
    await waitFor(() => expect(screen.getByLabelText("Selected period").textContent).toBe("past"));
    const sharedHref = view.history.location.href;
    view.unmount();

    writePostTimingPreference("guest", "all");
    await renderPosts(sharedHref);
    await waitFor(() => expect(screen.getByLabelText("Selected period").textContent).toBe("past"));
  });

  it.each(["all", "past"])("keeps %s through Posts, Map and the market list", async (timing) => {
    const { history } = await renderPosts(`/?tab=posts&timing=${timing}`);
    fireEvent.click(screen.getByRole("link", { name: "Map" }));
    await screen.findByRole("link", { name: "Market" });
    expect(new URLSearchParams(history.location.search).get("timing")).toBe(timing);

    fireEvent.click(screen.getByRole("link", { name: "Market" }));
    await waitFor(() => expect(history.location.pathname).toBe("/market"));
    expect(new URLSearchParams(history.location.search).get("timing")).toBe(timing);

    await act(async () => history.back());
    await waitFor(() => expect(history.location.pathname).toBe("/"));
    expect(new URLSearchParams(history.location.search).get("timing")).toBe(timing);
  });

  it("canonicalizes a legacy all-time link", async () => {
    const { history } = await renderPosts("/?tab=posts&posted=all");
    await waitFor(() => expect(screen.getByLabelText("Selected period").textContent).toBe("all"));
    expect(new URLSearchParams(history.location.search).get("posted")).toBeNull();
    expect(new URLSearchParams(history.location.search).get("timing")).toBe("all");
  });
});
