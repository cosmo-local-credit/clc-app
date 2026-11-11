import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { usePaletteStore } from "#/desktop/palette-store";
import { renderInShell } from "./-shell-test-router";
import { DesktopShell } from "./desktop-shell";
import { useShortcutHelp } from "./shortcut-help";

const ADDRESS = "0xabcdef1234567890abcdef1234567890abcdef12";

const auth = vi.hoisted(() => ({
  isAuthenticated: true,
  isLoading: false,
  address: "0xabcdef1234567890abcdef1234567890abcdef12" as string | undefined,
}));

vi.mock("#/features/auth/hooks/use-auth-status", () => ({ useAuthStatus: () => auth }));
vi.mock("#/features/auth/hooks/use-profile", () => ({
  useAuthProfile: () => ({ data: { name: "Amina Otieno" } }),
}));
vi.mock("#/hooks/use-resource-usage", () => ({ useResourceUsage: () => ({ data: undefined }) }));

beforeEach(() => {
  auth.isAuthenticated = true;
  auth.isLoading = false;
  auth.address = ADDRESS;
  window.localStorage.removeItem("clc.desktop.sidebar");
  window.localStorage.removeItem("clc.desktop.market-view");
  window.localStorage.removeItem("clc.desktop.shortcuts");
});

function shell(url: string) {
  const client = new QueryClient();
  return renderInShell(
    <QueryClientProvider client={client}>
      <DesktopShell>
        <p>page</p>
      </DesktopShell>
    </QueryClientProvider>,
    url,
  );
}

const topBar = () => screen.queryByRole("navigation", { name: "Breadcrumb" });

describe("DesktopShell", () => {
  it("leaves the palette and the shortcut list closed when the shell goes away", async () => {
    // Narrowing the window unmounts the shell with ⌘K open; widening again
    // later must not open it out of nowhere.
    const view = await shell("/?tab=wallet");
    usePaletteStore.getState().setOpen(true);
    useShortcutHelp.getState().setOpen(true);
    view.unmount();

    expect(usePaletteStore.getState().open).toBe(false);
    expect(useShortcutHelp.getState().open).toBe(false);
  });

  it("gives the map no top bar, and a sidebar [ still collapses", async () => {
    await shell("/?tab=market");
    expect(topBar()).toBeNull();
    expect(screen.getByRole("button", { name: "Collapse" })).toBeTruthy();

    expect(fireEvent.keyDown(document.body, { key: "[" })).toBe(false);
    expect(window.localStorage.getItem("clc.desktop.sidebar")).toBe("collapsed");
    // Collapsed, every marketplace list remains a named top-level link.
    expect(await screen.findByRole("link", { name: "Offers" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Vouchers" })).toBeTruthy();
  });

  it("gives a page the top bar and a sidebar that [ collapses to a rail with an Expand control", async () => {
    await shell("/?tab=wallet");
    expect(topBar()).toBeTruthy();
    expect(screen.getByRole("button", { name: "Collapse" })).toBeTruthy();

    expect(fireEvent.keyDown(document.body, { key: "[" })).toBe(false);
    const expand = await screen.findByRole("button", { name: "Expand" });
    fireEvent.click(expand);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Collapse" })).toBeTruthy();
    });
  });

  it("gives the top bar Notification settings to a member and the way in to a guest", async () => {
    const member = await shell("/?tab=wallet");
    expect(screen.getByRole("link", { name: "Notification settings" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
    member.unmount();

    auth.isAuthenticated = false;
    auth.address = undefined;
    await shell("/?tab=posts");
    expect(screen.queryByRole("link", { name: "Notification settings" })).toBeNull();
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe(
      "/onboarding?step=welcome",
    );
    // Search and the shortcut reference are public, so both stay.
    expect(screen.getByRole("button", { name: "Keyboard shortcuts" })).toBeTruthy();
  });

  it("offers no way in while the session is still being checked", async () => {
    auth.isAuthenticated = false;
    auth.isLoading = true;
    auth.address = undefined;
    await shell("/?tab=posts");
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
  });

  it("frames a list link that names no view by the view last used", async () => {
    window.localStorage.setItem("clc.desktop.market-view", "list");
    await shell("/market?scope=offers");
    expect(topBar()).toBeTruthy();
  });

  it("frames the map when the map was last used, or when nothing was", async () => {
    window.localStorage.setItem("clc.desktop.market-view", "map");
    const remembered = await shell("/market?scope=offers");
    expect(topBar()).toBeNull();
    remembered.unmount();

    window.localStorage.removeItem("clc.desktop.market-view");
    await shell("/market?scope=offers");
    expect(topBar()).toBeNull();
  });

  it("lets the URL's view win over the one last used", async () => {
    window.localStorage.setItem("clc.desktop.market-view", "list");
    await shell("/market?scope=offers&view=map");
    expect(topBar()).toBeNull();
  });
});
