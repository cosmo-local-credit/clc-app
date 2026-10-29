import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { renderInShell } from "./-shell-test-router";
import { DesktopShell } from "./desktop-shell";

const ADDRESS = "0xabcdef1234567890abcdef1234567890abcdef12";

vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({ isAuthenticated: true, address: ADDRESS }),
}));
vi.mock("#/features/auth/hooks/use-profile", () => ({
  useAuthProfile: () => ({ data: { name: "Amina Otieno" } }),
}));
vi.mock("#/hooks/use-resource-usage", () => ({ useResourceUsage: () => ({ data: undefined }) }));

beforeEach(() => {
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
  it("gives the map a forced rail with no top bar, and leaves [ with nothing to toggle", async () => {
    await shell("/?tab=market");
    expect(topBar()).toBeNull();
    expect(screen.queryByRole("button", { name: "Expand" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Collapse" })).toBeNull();
    // The rail still reaches every marketplace list.
    expect(screen.getByRole("button", { name: "Marketplace lists" })).toBeTruthy();

    expect(fireEvent.keyDown(document.body, { key: "[" })).toBe(true);
    expect(window.localStorage.getItem("clc.desktop.sidebar")).toBeNull();
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
