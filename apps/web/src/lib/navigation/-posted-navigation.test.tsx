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
import { writePostedWithinPreference } from "./catalog-filter-preference-storage";
import { parseHomeTab } from "./home-tabs";
import { usePostedWithin } from "./use-posted-within";

function PostsFixture() {
  const { posted, setPosted } = usePostedWithin("guest");
  const search = useSearch({ strict: false });
  const tab = parseHomeTab(search.tab);
  return (
    <>
      <output aria-label="Selected period">{posted}</output>
      <button type="button" onClick={() => setPosted("1m")}>
        Use one month
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

describe("posted-window navigation", () => {
  it("keeps an explicit one-month link ahead of a saved all-time preference", async () => {
    writePostedWithinPreference("guest", "all");
    const { history } = await renderPosts("/?tab=posts&posted=1m");

    await waitFor(() => expect(screen.getByLabelText("Selected period").textContent).toBe("1m"));
    expect(new URLSearchParams(history.location.search).get("posted")).toBe("1m");
  });

  it("shares a selected one-month window with someone whose preference is all-time", async () => {
    const view = await renderPosts("/?tab=posts&posted=all");
    fireEvent.click(screen.getByRole("button", { name: "Use one month" }));
    await waitFor(() => expect(screen.getByLabelText("Selected period").textContent).toBe("1m"));
    const sharedHref = view.history.location.href;
    view.unmount();

    writePostedWithinPreference("guest", "all");
    await renderPosts(sharedHref);
    await waitFor(() => expect(screen.getByLabelText("Selected period").textContent).toBe("1m"));
  });

  it.each(["all", "1m"])("keeps %s through Posts, Map and the market list", async (posted) => {
    const { history } = await renderPosts(`/?tab=posts&posted=${posted}`);
    fireEvent.click(screen.getByRole("link", { name: "Map" }));
    await screen.findByRole("link", { name: "Market" });
    expect(new URLSearchParams(history.location.search).get("posted")).toBe(posted);

    fireEvent.click(screen.getByRole("link", { name: "Market" }));
    await waitFor(() => expect(history.location.pathname).toBe("/market"));
    expect(new URLSearchParams(history.location.search).get("posted")).toBe(posted);

    await act(async () => history.back());
    await waitFor(() => expect(history.location.pathname).toBe("/"));
    expect(new URLSearchParams(history.location.search).get("posted")).toBe(posted);
  });
});
