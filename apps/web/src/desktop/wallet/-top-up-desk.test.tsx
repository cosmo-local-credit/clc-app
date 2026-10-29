import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const ADDRESS = "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d";

const mocks = vi.hoisted(() => ({
  submit: vi.fn(),
  mutationError: null as string | null,
}));

vi.mock("#/features/wallet/hooks/use-pretium-cash", () => ({
  useCashAccess: () => ({
    cashAddress: ADDRESS,
    cashTransactions: [],
    transactionsQuery: {
      isPending: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    },
    profilePending: false,
    phone: "+254712345678",
    hasKenyanPhone: true,
    disabledReason: null,
    entryDisabled: false,
  }),
  useAddStables: () => ({
    amount: "500",
    setAmount: vi.fn(),
    hasValidAmount: true,
    canContinue: true,
    showSafaricomWarning: false,
    ratesPending: false,
    approxUsdt: 3.9,
    mutationError: mocks.mutationError,
    pending: false,
    submit: mocks.submit,
  }),
  usePretiumWithdraw: () => ({
    eligible: [],
    selected: undefined,
    tokensPending: false,
    linkReady: true,
    linkPreparing: false,
    linkFailed: false,
    linkRetrying: false,
    amount: "",
    setAmount: vi.fn(),
    canSetMax: false,
    hasValidAmount: false,
    canWithdraw: false,
    pending: false,
    sendError: null,
    submit: vi.fn(),
  }),
}));

import { TopUpDesk } from "./top-up-desk";

async function mount(url: string) {
  const root = createRootRoute({ component: Outlet });
  const topUp = createRoute({
    getParentRoute: () => root,
    path: "/wallet/top-up",
    validateSearch: (search: Record<string, unknown>) => ({
      sheet:
        search.sheet === "add" || search.sheet === "withdraw"
          ? (search.sheet as "add" | "withdraw")
          : undefined,
      tx: typeof search.tx === "string" ? search.tx : undefined,
    }),
    component: TopUpDesk,
  });
  const router = createRouter({
    routeTree: root.addChildren([topUp]),
    history: createMemoryHistory({ initialEntries: [url] }),
  });
  render(<RouterProvider router={router} />);
  await screen.findByRole("heading", { level: 1, name: "Add / withdraw" });
  return router;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.mutationError = null;
  mocks.submit.mockResolvedValue(true);
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => 1400,
  });
});

afterEach(() => {
  Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
});

describe("Add / withdraw", () => {
  it("closes a direct link to the page itself instead of going back", async () => {
    const router = await mount("/wallet/top-up?sheet=add");
    expect(router.history.canGoBack()).toBe(false);

    fireEvent.click(
      within(await screen.findByRole("complementary")).getByRole("button", { name: "Close" }),
    );

    await waitFor(() => expect(router.state.location.search.sheet).toBeUndefined());
    expect(router.state.location.pathname).toBe("/wallet/top-up");
  });

  it("closes a form opened from the page by going back, and moves focus into it", async () => {
    const router = await mount("/wallet/top-up");

    fireEvent.click(screen.getAllByRole("button", { name: /MPESA via Pretium/ })[0]);
    const inspector = await screen.findByRole("complementary");
    expect(router.state.location.search.sheet).toBe("add");
    expect(document.activeElement).toBe(inspector);

    fireEvent.click(within(inspector).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(router.state.location.search.sheet).toBeUndefined());
    expect(router.history.canGoBack()).toBe(false);
  });

  it("keeps the form's action in the inspector footer, outside what scrolls", async () => {
    await mount("/wallet/top-up?sheet=add");
    const inspector = await screen.findByRole("complementary");

    const submit = within(inspector).getByRole("button", { name: "Continue" });
    expect(submit.closest(".overflow-y-auto")).toBeNull();
    expect(
      within(inspector).getByLabelText("Amount (KES)").closest(".overflow-y-auto"),
    ).not.toBeNull();

    // It still submits the form it sits beside.
    expect(submit.getAttribute("form")).toBe("topup-add");
    fireEvent.submit(inspector.querySelector("form#topup-add") as HTMLFormElement);
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledTimes(1));
  });

  it("shows a failed submit beside the action so it is never scrolled out of view", async () => {
    mocks.mutationError = "MPESA is unavailable right now";
    await mount("/wallet/top-up?sheet=add");
    const inspector = await screen.findByRole("complementary");

    const alert = within(inspector).getByRole("alert");
    expect(alert.textContent).toContain("MPESA is unavailable right now");
    expect(alert.closest(".overflow-y-auto")).toBeNull();
  });
});
