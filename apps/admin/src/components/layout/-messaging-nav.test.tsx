import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("#/lib/messaging-config", () => ({ MESSAGING_ENABLED: false }));
vi.mock("#/components/layout/operator-menu", () => ({ OperatorMenu: () => null }));
vi.mock("#/components/layout/command-palette", () => ({ CommandPalette: () => null }));
vi.mock("#/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("#/features/retirement/retirement-notification", () => ({
  RetirementPendingBadge: () => null,
}));

import { AppShell } from "./app-shell";

describe("messaging navigation behind VITE_MESSAGING_ENABLED", () => {
  it("leaves the helpdesk and abuse reports out of the sidebar while the flag is off", async () => {
    const root = createRootRoute({ component: AppShell });
    const home = createRoute({
      getParentRoute: () => root,
      path: "/",
      component: () => <p>home</p>,
    });
    const router = createRouter({
      routeTree: root.addChildren([home]),
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    render(<RouterProvider router={router} />);
    await screen.findByText("home");
    expect(screen.getByRole("link", { name: "Reviews" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Helpdesk" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Abuse reports" })).toBeNull();
  });
});
