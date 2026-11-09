import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

type Auth = { isAuthenticated: boolean; isLoading: boolean };
const auth = vi.hoisted(() => ({ current: { isAuthenticated: false, isLoading: false } as Auth }));

vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => auth.current,
}));

import { VoucherActionCells } from "./voucher-actions";

const VOUCHER = "0x3fA1000000000000000000000000000000000c92";
const OWNER = "0x2a22f9c3b484c3629090FeED35F17Ff8F88f76F0";

type Props = Partial<Parameters<typeof VoucherActionCells>[0]>;

async function renderCells(props: Props = {}) {
  const root = createRootRoute({ component: Outlet });
  const cells = createRoute({
    getParentRoute: () => root,
    path: "/",
    component: () => (
      <VoucherActionCells
        address={VOUCHER}
        name="Kilifi Food Pass"
        hasPositiveBalance={false}
        {...props}
      />
    ),
  });
  const stubs = ["/market", "/wallet/send", "/wallet/send/amount", "/onboarding"].map((path) =>
    createRoute({
      getParentRoute: () => root,
      path,
      validateSearch: (search: Record<string, unknown>) => search,
      component: () => null,
    }),
  );
  const router = createRouter({
    routeTree: root.addChildren([cells, ...stubs]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
  await screen.findByRole("group", { name: "Voucher actions" });
  return router;
}

/** What a screen reader announces after the button's name. */
function description(button: HTMLElement) {
  const id = button.getAttribute("aria-describedby");
  return id ? (document.getElementById(id)?.textContent ?? null) : null;
}

function action(name: string) {
  return within(screen.getByRole("group", { name: "Voucher actions" })).getByRole(
    name === "Get" || name === "Website" || name === "Call" ? "link" : "button",
    { name },
  );
}

beforeEach(() => {
  auth.current = { isAuthenticated: false, isLoading: false };
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("VoucherActionCells for a visitor", () => {
  it("keeps every cell, and each unavailable one is focusable and says why", async () => {
    await renderCells({ phone: "+254700000000", website: "https://example.org" });
    const group = screen.getByRole("group", { name: "Voucher actions" });

    expect(within(group).getByRole("link", { name: "Get" })).toBeTruthy();
    const reasons: Record<string, string> = {
      Send: "Sign in to send",
      Redeem: "Sign in to redeem",
      Directions: "Sign in for directions",
      Call: "Sign in to call",
      Website: "Sign in to open the website",
    };
    for (const [name, reason] of Object.entries(reasons)) {
      const cell = within(group).getByRole("button", { name });
      expect(cell.getAttribute("aria-disabled")).toBe("true");
      // A button, not a muted span: a keyboard user can land on it.
      expect(cell.tabIndex).toBe(0);
      expect(description(cell)).toBe(reason);
    }
    expect(group.children).toHaveLength(6);
  });

  it("offers a visible Sign in link that returns to this page", async () => {
    await renderCells();
    const signIn = screen.getByRole("link", { name: "Sign in" });
    expect(signIn.getAttribute("href")).toContain("/onboarding");
    expect(signIn.getAttribute("href")).toContain("signin");
  });

  it("shows the reason on focus and on hover, and clears it on leave", async () => {
    await renderCells();
    const send = screen.getByRole("button", { name: "Send" });
    // Only the screen-reader description exists until the cell is reached.
    expect(screen.getAllByText("Sign in to send")).toHaveLength(1);

    act(() => send.focus());
    expect(screen.getAllByText("Sign in to send")).toHaveLength(2);
    act(() => send.blur());
    expect(screen.getAllByText("Sign in to send")).toHaveLength(1);

    fireEvent.mouseEnter(send);
    expect(screen.getAllByText("Sign in to send")).toHaveLength(2);
    fireEvent.mouseLeave(send);
    expect(screen.getAllByText("Sign in to send")).toHaveLength(1);
  });

  it("does nothing when an unavailable cell is activated", async () => {
    const router = await renderCells();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(router.state.location.pathname).toBe("/");
  });
});

describe("VoucherActionCells for a signed-in viewer", () => {
  beforeEach(() => {
    auth.current = { isAuthenticated: true, isLoading: false };
  });

  it("says no balance, or no contact detail, rather than asking to sign in", async () => {
    await renderCells({ locationName: "Kilifi", ownerAddress: OWNER });

    expect(description(screen.getByRole("button", { name: "Send" }))).toBe("No balance");
    expect(description(screen.getByRole("button", { name: "Redeem" }))).toBe("No balance");
    expect(description(screen.getByRole("button", { name: "Call" }))).toBe("No phone listed");
    expect(description(screen.getByRole("button", { name: "Website" }))).toBe("No website listed");
    // Directions has a location, so it is a live action.
    expect(
      screen.getByRole("button", { name: "Directions" }).getAttribute("aria-disabled"),
    ).toBeNull();
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
  });

  it("tells a balance still loading, or failed, from an empty one", async () => {
    await renderCells({ balanceStatus: "loading" });
    expect(description(screen.getByRole("button", { name: "Send" }))).toBe("Checking balance…");
  });

  it("tells a failed balance from an empty one", async () => {
    await renderCells({ balanceStatus: "unavailable" });
    expect(description(screen.getByRole("button", { name: "Send" }))).toBe("Balance unavailable");
  });

  it("says when there is no issuer to redeem with", async () => {
    await renderCells({ hasPositiveBalance: true, ownerAddress: null });
    expect(screen.getByRole("link", { name: "Send" })).toBeTruthy();
    expect(description(screen.getByRole("button", { name: "Redeem" }))).toBe("No issuer listed");
  });

  it("is plain links with no reason line when everything is available", async () => {
    await renderCells({
      hasPositiveBalance: true,
      ownerAddress: OWNER,
      locationName: "Kilifi",
      phone: "+254700000000",
      website: "https://example.org",
    });
    const group = screen.getByRole("group", { name: "Voucher actions" });
    expect(group.querySelectorAll('[aria-disabled="true"]')).toHaveLength(0);
    expect(action("Call").getAttribute("href")).toBe("tel:+254700000000");
    expect(action("Website").getAttribute("href")).toBe("https://example.org");
    expect(document.querySelector(".sr-only")).toBeNull();
  });
});

describe("VoucherActionCells while the session is checked", () => {
  it("does not tell a returning viewer to sign in yet", async () => {
    auth.current = { isAuthenticated: false, isLoading: true };
    await renderCells();
    expect(description(screen.getByRole("button", { name: "Send" }))).toBe(
      "Checking your session…",
    );
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
  });
});
