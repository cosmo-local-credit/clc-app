import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useNavigate,
} from "@tanstack/react-router";
import { describe, expect, it } from "vite-plus/test";

import { activityInspectorSearch } from "./activity-desk";

const TX = "7:0xabc";

function OpenInspector() {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => {
        void navigate({
          to: "/",
          search: { tab: "activity", tx: TX },
        });
      }}
    >
      Open
    </button>
  );
}

function createTestRouter() {
  const rootRoute = createRootRoute({ component: Outlet });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    validateSearch: (search: Record<string, unknown>) => ({
      tab: typeof search.tab === "string" ? search.tab : undefined,
      tx: typeof search.tx === "string" ? search.tx : undefined,
    }),
    component: OpenInspector,
  });
  return createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ["/?tab=activity"] }),
  });
}

describe("activity inspector history", () => {
  it("keeps the rest of the search when it sets tx", () => {
    const previous: { tab: "activity"; activityQ: string; tx?: string } = {
      tab: "activity",
      activityQ: "tea",
    };
    expect(activityInspectorSearch(previous, TX)).toEqual({ ...previous, tx: TX });
  });

  it("pushes ?tx= and Back clears it", async () => {
    const router = createTestRouter();
    render(<RouterProvider router={router} />);
    fireEvent.click(await screen.findByRole("button", { name: "Open" }));
    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({ tab: "activity", tx: TX });
    });
    router.history.back();
    await waitFor(() => {
      expect(router.state.location.search.tx).toBeUndefined();
    });
  });
});
