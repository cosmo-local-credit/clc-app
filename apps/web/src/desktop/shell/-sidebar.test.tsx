import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { renderInShell } from "./-shell-test-router";
import { DesktopSidebar } from "./sidebar";

const ADDRESS = "0xabcdef1234567890abcdef1234567890abcdef12";

const auth = vi.hoisted(() => ({
  isAuthenticated: true,
  isLoading: false,
  address: "0xabcdef1234567890abcdef1234567890abcdef12" as string | undefined,
}));

vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => auth,
}));
const unread = vi.hoisted(() => ({ count: 0 }));
vi.mock("#/features/messaging/hooks/use-activity-counts", () => ({
  useActivityCounts: () => ({ total: unread.count }),
}));
vi.mock("#/features/auth/hooks/use-profile", () => ({
  useAuthProfile: () => ({ data: { name: "Amina Otieno" } }),
}));

beforeEach(() => {
  auth.isAuthenticated = true;
  auth.isLoading = false;
  auth.address = ADDRESS;
  unread.count = 0;
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
    ["expanded", undefined],
    ["collapsed", "collapsed"],
  ])("keeps Settings and the profile reachable in %s", async (_label, stored) => {
    if (stored) window.localStorage.setItem("clc.desktop.sidebar", stored);
    await renderInShell(<DesktopSidebar />, "/");

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

  it("stays expanded on the map, which only the person's own Collapse closes", async () => {
    await renderInShell(<DesktopSidebar />, "/?tab=market");
    expect(screen.getByRole("button", { name: "Collapse" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Wallet" }).textContent).toBe("Wallet");
  });
});

describe("desktop app preferences", () => {
  it("shows the app utilities directly in the expanded sidebar", async () => {
    await renderInShell(<DesktopSidebar />, "/?tab=market");
    const utilities = screen.getByRole("group", { name: "App preferences" });

    const about = within(utilities).getByRole("link", { name: "About" });
    const terms = within(utilities).getByRole("link", { name: "Terms of Service" });
    expect(about.getAttribute("target")).toBe("_blank");
    expect(about.getAttribute("rel")).toBe("noopener noreferrer");
    expect(terms.getAttribute("target")).toBe("_blank");
    expect(within(utilities).getByRole("combobox", { name: "Language" }).textContent).toContain(
      "Language",
    );
    expect(within(utilities).getByRole("button", { name: "Dark mode" }).textContent).toContain(
      "Theme",
    );
    expect(screen.queryByRole("button", { name: "Open menu" })).toBeNull();
  });

  it("keeps every utility accessible in the collapsed rail", async () => {
    window.localStorage.setItem("clc.desktop.sidebar", "collapsed");
    await renderInShell(<DesktopSidebar />, "/?tab=market");
    const utilities = screen.getByRole("group", { name: "App preferences" });

    expect(within(utilities).getByRole("link", { name: "About" }).textContent).toBe("");
    expect(within(utilities).getByRole("combobox", { name: "Language" }).title).toBe("Language");
    expect(within(utilities).getByRole("button", { name: "Dark mode" })).toBeTruthy();
    expect(within(utilities).getByRole("link", { name: "Terms of Service" }).textContent).toBe("");
    expect(
      await tooltipFor(within(utilities).getByRole("link", { name: "About" }), "About"),
    ).toBeTruthy();
  });
});

describe("the Activity unread count", () => {
  it("sits beside the label in the expanded sidebar", async () => {
    unread.count = 2;
    await renderInShell(<DesktopSidebar />, "/?tab=wallet");
    const activity = screen.getByRole("link", { name: "Activity, 2 new" });
    expect(activity.textContent).toContain("2");
  });

  it("stays in the rail's icon-only name", async () => {
    unread.count = 12;
    window.localStorage.setItem("clc.desktop.sidebar", "collapsed");
    await renderInShell(<DesktopSidebar />, "/?tab=wallet");
    const activity = screen.getByRole("link", { name: "Activity, 12 new" });
    expect(activity.textContent).toBe("9+");
  });
});

describe("top-level marketplace destinations", () => {
  async function scopeLink(url: string, name: string) {
    const view = await renderInShell(<DesktopSidebar />, url);
    return { ...view, link: screen.getByRole("link", { name }) };
  }

  it("uses the specified order and keeps every resource at the top level", async () => {
    const view = await renderInShell(<DesktopSidebar />, "/");
    const nav = screen.getByRole("navigation", { name: "Primary navigation" });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual([
      "Market",
      "Offers",
      "Wants",
      "Vouchers",
      "Pools",
      "Catalogs",
      "Posts",
      "Activity",
      "Wallet",
    ]);
    view.unmount();

    window.localStorage.setItem("clc.desktop.sidebar", "collapsed");
    await renderInShell(<DesktopSidebar />, "/");
    expect(screen.getByRole("link", { name: "Offers" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Marketplace lists" })).toBeNull();
  });

  it("always opens a resource as its full-page list", async () => {
    const { link, router } = await scopeLink("/market?scope=offers&view=list", "Wants");
    expect(link.getAttribute("href")).toBe("/market?scope=wants&view=list");
    fireEvent.click(link);
    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({ scope: "wants", view: "list" });
    });
  });

  it("does not generate scoped map URLs from resource links", async () => {
    const { link } = await scopeLink("/market?scope=offers&view=map", "Catalogs");
    expect(link.getAttribute("href")).toBe("/market?scope=catalogs&view=list");
  });

  it("always sends Market to the unified map", async () => {
    const fromWallet = await scopeLink("/?tab=wallet", "Market");
    expect(fromWallet.link.getAttribute("href")).toBe("/?tab=market&view=map");
    fromWallet.unmount();

    const fromList = await scopeLink("/market?scope=offers&view=list", "Market");
    expect(fromList.link.getAttribute("href")).toBe("/?tab=market&view=map");
  });

  it("keeps the shared search while it changes the list", async () => {
    const { link } = await scopeLink("/market?scope=offers&view=list&q=tea&credit=1", "Wants");
    const href = new URL(link.getAttribute("href") ?? "", "http://x");
    expect(Object.fromEntries(href.searchParams)).toMatchObject({
      scope: "wants",
      view: "list",
      q: "tea",
    });
  });
});

describe("Wallet", () => {
  it("is one item, with no section list under it", async () => {
    await renderInShell(<DesktopSidebar />, "/?tab=wallet");

    const nav = screen.getByRole("navigation", { name: "Primary navigation" });
    const wallet = within(nav).getByRole("link", { name: "Wallet" });
    expect(wallet.getAttribute("href")).toBe("/?tab=wallet");
    expect(wallet.getAttribute("aria-current")).toBe("page");
    // The sections it used to carry are the page's own headings now.
    for (const label of ["Holdings", "My Vouchers", "My Pools", "My Wants", "My Catalogs"]) {
      expect(within(nav).queryByRole("link", { name: label })).toBeNull();
    }
  });
});

describe("a guest", () => {
  beforeEach(() => {
    auth.isAuthenticated = false;
    auth.address = undefined;
  });

  it("is offered only what it can open", async () => {
    await renderInShell(<DesktopSidebar />, "/?tab=market");
    const nav = screen.getByRole("navigation", { name: "Primary navigation" });
    for (const name of ["Wallet", "Activity", "Settings", "My Pools"]) {
      expect(within(nav).queryByRole("link", { name })).toBeNull();
    }
    expect(screen.queryByRole("link", { name: "Settings" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Wallet" })).toBeNull();
    // Market and Posts are public, so both stay, lists included.
    expect(within(nav).getByRole("link", { name: "Market" })).toBeTruthy();
    expect(within(nav).getByRole("link", { name: "Posts" })).toBeTruthy();
    expect(within(nav).getByRole("link", { name: "Pools" })).toBeTruthy();
  });

  it("keeps Expand in the rail, the one way back from it", async () => {
    window.localStorage.setItem("clc.desktop.sidebar", "collapsed");
    await renderInShell(<DesktopSidebar />, "/?tab=market");
    expect(screen.getByRole("button", { name: "Expand" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Wallet sections" })).toBeNull();
  });

  it("still sees them while the session check runs, so nothing pops out", async () => {
    auth.isLoading = true;
    await renderInShell(<DesktopSidebar />, "/?tab=market");
    const nav = screen.getByRole("navigation", { name: "Primary navigation" });
    expect(within(nav).getByRole("link", { name: "Wallet" })).toBeTruthy();
    expect(within(nav).getByRole("link", { name: "Activity" })).toBeTruthy();
  });
});

describe("selected state", () => {
  it("marks the list the URL is on and only that one", async () => {
    await renderInShell(<DesktopSidebar />, "/market?scope=pools");
    expect(screen.getByRole("link", { name: "Pools" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Offers" }).getAttribute("aria-current")).toBeNull();
  });
});
