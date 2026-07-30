import { CATALOG_MAX_TAGS } from "@clc/core/features/catalog/logic";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
  RouterProvider,
} from "@tanstack/react-router";
import { render, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { canonicalRedirectSearch, pickCatalogSearch } from "#/lib/navigation/catalog-search";
import {
  type HomeTab,
  type MarketView,
  parseHomeTab,
  parseMarketView,
} from "#/lib/navigation/home-tabs";

function createTestRouter(initialEntry: string) {
  const rootRoute = createRootRoute({ component: Outlet });

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    validateSearch: (
      search,
    ): { tab?: HomeTab; view?: MarketView } & ReturnType<typeof pickCatalogSearch> => ({
      tab: parseHomeTab(search.tab),
      view: parseMarketView(search.view),
      ...pickCatalogSearch(search),
    }),
    beforeLoad: ({ search }) => {
      const next = canonicalRedirectSearch(search);
      if (!next) return;
      throw redirect({ to: "/", search: next, replace: true });
    },
    component: () => <div data-testid="home" />,
  });

  const history = createMemoryHistory({ initialEntries: [initialEntry] });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history,
  });

  return { router, history };
}

async function settle(initialEntry: string) {
  const { router, history } = createTestRouter(initialEntry);
  render(<RouterProvider router={router} />);
  await waitFor(() => expect(router.state.status).toBe("idle"));
  return { router, history };
}

describe("home catalog search canonicalization through the router", () => {
  it("rewrites a non-canonical term in the address bar", async () => {
    const { history } = await settle("/?q=%20%20art%20%20");

    expect(new URLSearchParams(history.location.search).get("q")).toBe("art");
  });

  it("leaves the coerced tab and view exactly as an uncorrected load would", async () => {
    const corrected = await settle("/?q=%20%20art");
    const uncorrected = await settle("/?q=art");

    const read = (search: string) => {
      const params = new URLSearchParams(search);
      return { tab: params.get("tab"), view: params.get("view") };
    };

    expect(read(corrected.history.location.search)).toEqual(
      read(uncorrected.history.location.search),
    );
    expect(new URLSearchParams(corrected.history.location.search).get("q")).toBe("art");
  });

  it("preserves view when the URL carried it", async () => {
    const { history } = await settle("/?view=list&q=%20art");

    const params = new URLSearchParams(history.location.search);
    expect(params.get("view")).toBe("list");
    expect(params.get("q")).toBe("art");
  });

  it("collapses a repeated tag key into the single comma-joined form", async () => {
    const { history } = await settle("/?tags=Mobility&tags=Art");

    const params = new URLSearchParams(history.location.search);
    expect(params.getAll("tags")).toEqual(["Art,Mobility"]);
  });

  it("drops a tagMatch that cannot mean anything at one tag", async () => {
    const { history } = await settle("/?tags=Art&tagMatch=all");

    const params = new URLSearchParams(history.location.search);
    expect(params.has("tagMatch")).toBe(false);
    expect(params.get("tags")).toBe("Art");
  });

  it("replaces rather than stacks, so Back does not step through corrections", async () => {
    const { history } = await settle("/?q=%20%20art");

    expect(history.length).toBe(1);
  });

  it("settles on an already-canonical URL without redirecting", async () => {
    const { history } = await settle("/?q=art");

    expect(history.location.search).toContain("q=art");
    expect(history.length).toBe(1);
  });

  it("settles on a bare visit without adding any filter key", async () => {
    const { history } = await settle("/");

    const params = new URLSearchParams(history.location.search);
    expect(params.has("q")).toBe(false);
    expect(params.has("tags")).toBe(false);
    expect(params.has("tagMatch")).toBe(false);
    expect(history.length).toBe(1);
  });

  it("settles instead of looping when a correction is required", async () => {
    const { router, history } = await settle("/?tags=Mobility&tags=Art&tagMatch=all&q=%20art%20");

    expect(router.state.status).toBe("idle");
    const params = new URLSearchParams(history.location.search);
    expect(params.get("q")).toBe("art");
    expect(params.get("tags")).toBe("Art,Mobility");
    expect(params.get("tagMatch")).toBe("all");
  });

  it("keeps every tag of an over-limit URL rather than truncating to a valid filter", async () => {
    const tags = Array.from({ length: CATALOG_MAX_TAGS + 1 }, (_, index) => `Tag${index}`);
    const query = tags.map((tag) => `tags=${tag}`).join("&");
    const { router } = await settle(`/?${query}`);

    expect(router.state.status).toBe("idle");
    expect(router.state.location.search.tags).toEqual(tags);
  });
});
