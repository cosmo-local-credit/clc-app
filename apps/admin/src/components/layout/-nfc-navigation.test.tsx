import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("#/components/layout/operator-menu", () => ({ OperatorMenu: () => null }));
vi.mock("#/components/layout/command-palette", () => ({ CommandPalette: () => null }));
vi.mock("#/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("#/features/retirement/retirement-notification", () => ({
  RetirementPendingBadge: () => null,
}));

import { AppShell } from "./app-shell";

describe("NFC navigation", () => {
  it("opens NFC cards as its own section and Back returns to paper wallets", async () => {
    const root = createRootRoute({ component: AppShell });
    const home = createRoute({ getParentRoute: () => root, path: "/", component: () => null });
    const paper = createRoute({
      getParentRoute: () => root,
      path: "/paper-wallets",
      component: () => <p>Print wallets</p>,
    });
    const nfc = createRoute({
      getParentRoute: () => root,
      path: "/nfc-cards",
      component: () => <p>Write cards</p>,
    });
    const router = createRouter({
      routeTree: root.addChildren([home, paper, nfc]),
      history: createMemoryHistory({ initialEntries: ["/paper-wallets"] }),
    });
    render(<RouterProvider router={router} />);
    await screen.findByText("Print wallets");
    const link = screen.getByRole("link", { name: "NFC cards" });
    expect(link.getAttribute("href")).toBe("/nfc-cards");
    fireEvent.click(link);
    await screen.findByText("Write cards");
    expect(router.state.location.pathname).toBe("/nfc-cards");

    act(() => router.history.back());
    await waitFor(() => expect(router.state.location.pathname).toBe("/paper-wallets"));
    expect(await screen.findByText("Print wallets")).toBeTruthy();
  });
});
