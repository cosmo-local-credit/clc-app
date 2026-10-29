import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { renderInShell } from "./-shell-test-router";
import { DesktopSidebar } from "./sidebar";

const ADDRESS = "0xabcdef1234567890abcdef1234567890abcdef12";

vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({ isAuthenticated: true, address: ADDRESS }),
}));
vi.mock("#/features/auth/hooks/use-profile", () => ({
  useAuthProfile: () => ({ data: { name: "Amina Otieno" } }),
}));

beforeEach(() => {
  window.localStorage.removeItem("clc.desktop.sidebar");
  window.localStorage.removeItem("clc.desktop.market-view");
});

/** A tooltip's text is the only place its label is written out, so finding it proves it opened. */
async function tooltipFor(control: HTMLElement, label: string) {
  fireEvent.focus(control);
  fireEvent.mouseEnter(control);
  return screen.findByText(label);
}

describe("the collapsed rail", () => {
  it("collapses and expands from visible, labelled controls, not only from the [ key", async () => {
    await renderInShell(<DesktopSidebar />, "/?tab=wallet");
    expect(screen.queryByRole("button", { name: "Expand" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Collapse" }));
    expect(window.localStorage.getItem("clc.desktop.sidebar")).toBe("collapsed");

    const expand = await screen.findByRole("button", { name: "Expand" });
    // The old control was `display: none` once collapsed.
    expect(expand.closest(".hidden")).toBeNull();
    expect(screen.queryByRole("button", { name: "Collapse" })).toBeNull();

    fireEvent.click(expand);
    expect(await screen.findByRole("button", { name: "Collapse" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Wallet" }).textContent).toBe("Wallet");
  });

  it("names every destination and shows its label in a tooltip", async () => {
    window.localStorage.setItem("clc.desktop.sidebar", "collapsed");
    await renderInShell(<DesktopSidebar />, "/?tab=wallet");

    const nav = screen.getByRole("navigation", { name: "Primary navigation" });
    for (const name of ["Market", "Wallet", "Activity", "Posts"]) {
      const link = within(nav).getByRole("link", { name });
      // Icon only: the visible text is gone, so the tooltip is the sighted label.
      expect(link.textContent).toBe("");
    }
    // Market is a link of its own, built differently from the others.
    expect(
      await tooltipFor(within(nav).getByRole("link", { name: "Market" }), "Market"),
    ).toBeTruthy();
    expect(
      await tooltipFor(within(nav).getByRole("link", { name: "Activity" }), "Activity"),
    ).toBeTruthy();
  });

  it.each([
    ["expanded", false, undefined],
    ["collapsed", false, "collapsed"],
    ["the map's forced rail", true, undefined],
  ])("keeps Settings and the profile reachable in %s", async (_label, rail, stored) => {
    if (stored) window.localStorage.setItem("clc.desktop.sidebar", stored);
    await renderInShell(<DesktopSidebar rail={rail} />, "/");

    const settings = screen.getByRole("link", { name: "Settings" });
    expect(settings.getAttribute("href")).toBe("/?tab=settings");
    expect(
      screen.getByRole("link", { name: /Amina Otieno|Edit profile/ }).getAttribute("href"),
    ).toBe("/settings/profile");
  });

  it("labels the Settings and profile icons with tooltips when collapsed", async () => {
    window.localStorage.setItem("clc.desktop.sidebar", "collapsed");
    await renderInShell(<DesktopSidebar />, "/");

    expect(
      await tooltipFor(screen.getByRole("link", { name: "Settings" }), "Settings"),
    ).toBeTruthy();
    expect(
      await tooltipFor(screen.getByRole("link", { name: "Edit profile" }), "Edit profile"),
    ).toBeTruthy();
  });

  it("has no Expand or Collapse where the map forces the rail", async () => {
    await renderInShell(<DesktopSidebar rail />, "/");
    expect(screen.queryByRole("button", { name: "Expand" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Collapse" })).toBeNull();
  });
});

describe("the marketplace lists in the rail", () => {
  it("opens a menu from the Market icon that reaches every list, even where the rail is forced", async () => {
    const { router } = await renderInShell(<DesktopSidebar rail />, "/");
    expect(screen.queryByRole("link", { name: "Offers" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Marketplace lists" }));
    const lists = await screen.findByRole("navigation", { name: "Marketplace" });
    expect(
      within(lists)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Offers", "Wants", "Vouchers", "Pools", "Catalogs"]);

    fireEvent.click(within(lists).getByRole("link", { name: "Pools" }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/market");
    });
    expect(router.state.location.search).toMatchObject({ scope: "pools" });
    await waitFor(() => {
      expect(screen.queryByRole("navigation", { name: "Marketplace" })).toBeNull();
    });
  });

  it("keeps the list view when it opens a list", async () => {
    const { router } = await renderInShell(
      <DesktopSidebar rail />,
      "/market?scope=offers&view=list",
    );
    fireEvent.click(screen.getByRole("button", { name: "Marketplace lists" }));
    const lists = await screen.findByRole("navigation", { name: "Marketplace" });
    fireEvent.click(within(lists).getByRole("link", { name: "Wants" }));
    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({ scope: "wants", view: "list" });
    });
  });
});

describe("marketplace links keep the Map/List choice", () => {
  async function scopeLink(url: string, name: string) {
    const view = await renderInShell(<DesktopSidebar />, url);
    return { ...view, link: screen.getByRole("link", { name }) };
  }

  it("keeps list when the list is the view in use", async () => {
    const { link, router } = await scopeLink("/market?scope=offers&view=list", "Wants");
    expect(link.getAttribute("href")).toBe("/market?scope=wants&view=list");
    fireEvent.click(link);
    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({ scope: "wants", view: "list" });
    });
  });

  it("keeps map when the map is the view in use", async () => {
    const { link } = await scopeLink("/market?scope=offers&view=map", "Catalogs");
    expect(link.getAttribute("href")).toBe("/market?scope=catalogs&view=map");
  });

  it("adds no view when there is none, so a fresh visit lands on the default", async () => {
    const { link, unmount } = await scopeLink("/?tab=wallet", "Pools");
    expect(link.getAttribute("href")).toBe("/market?scope=pools");
    unmount();
    const fromScope = await scopeLink("/market?scope=offers", "Vouchers");
    expect(fromScope.link.getAttribute("href")).toBe("/market?scope=vouchers");
  });

  it("sends the Market item to the map, or to the list of everything in list view", async () => {
    const fromWallet = await scopeLink("/?tab=wallet", "Market");
    expect(fromWallet.link.getAttribute("href")).toBe("/?tab=market");
    fromWallet.unmount();

    const fromList = await scopeLink("/market?scope=offers&view=list", "Market");
    expect(fromList.link.getAttribute("href")).toBe("/market?scope=all&view=list");
  });

  it("opens the Market item in the last view used when the screen names none", async () => {
    window.localStorage.setItem("clc.desktop.market-view", "list");
    const fromWallet = await scopeLink("/?tab=wallet", "Market");
    expect(fromWallet.link.getAttribute("href")).toBe("/market?scope=all&view=list");
    fromWallet.unmount();

    window.localStorage.setItem("clc.desktop.market-view", "map");
    const remembersMap = await scopeLink("/?tab=wallet", "Market");
    expect(remembersMap.link.getAttribute("href")).toBe("/?tab=market");
  });

  it("lets the view in the URL win over the remembered one", async () => {
    window.localStorage.setItem("clc.desktop.market-view", "list");
    const { link } = await scopeLink("/market?scope=offers&view=map", "Market");
    expect(link.getAttribute("href")).toBe("/?tab=market&view=map");
  });

  it("keeps the shared search while it changes the list", async () => {
    const { link } = await scopeLink(
      "/market?scope=offers&view=list&q=tea&creditable=true",
      "Wants",
    );
    const href = new URL(link.getAttribute("href") ?? "", "http://x");
    expect(Object.fromEntries(href.searchParams)).toMatchObject({
      scope: "wants",
      view: "list",
      q: "tea",
    });
  });
});

describe("selected state", () => {
  it("marks the list the URL is on and only that one", async () => {
    await renderInShell(<DesktopSidebar />, "/market?scope=pools");
    expect(screen.getByRole("link", { name: "Pools" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Offers" }).getAttribute("aria-current")).toBeNull();
  });
});
