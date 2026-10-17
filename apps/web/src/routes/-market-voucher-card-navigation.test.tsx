import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { pickCatalogSearch } from "#/lib/navigation/catalog-search";
import { isAtHomeTabRoot, parseHomeSearch } from "#/lib/navigation/home-tabs";
import { useVoucherSheetSelection } from "#/lib/navigation/use-voucher-sheet-selection";
import { parseVoucherSheetSearch } from "#/lib/navigation/voucher-sheet-search";

const A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function Market() {
  const { voucher, open, close } = useVoucherSheetSelection();
  return (
    <div>
      <output data-testid="card">{voucher ?? "none"}</output>
      <button type="button" onClick={() => open(A)}>
        Pin A
      </button>
      <button type="button" onClick={() => open(B)}>
        Pin B
      </button>
      <button type="button" onClick={close}>
        Close
      </button>
      <Link to="/" search={(previous) => ({ ...previous, tab: "market", view: "list" })}>
        List
      </Link>
    </div>
  );
}

function createTestRouter(initialEntries: string[]) {
  const rootRoute = createRootRoute({ component: Outlet });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    validateSearch: (search) => ({ ...parseHomeSearch(search), ...pickCatalogSearch(search) }),
    component: Market,
  });
  // Any other screen that opens the card, with search of its own.
  const poolRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/pools/$poolAddress",
    validateSearch: (search) => ({
      tab: typeof search.tab === "string" ? search.tab : undefined,
      ...parseVoucherSheetSearch(search),
    }),
    component: Market,
  });
  const history = createMemoryHistory({
    initialEntries,
    initialIndex: initialEntries.length - 1,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, poolRoute]),
    history,
  });
  return { router, history };
}

async function renderMarket(initialEntries = ["/"]) {
  const result = createTestRouter(initialEntries);
  render(<RouterProvider router={result.router} />);
  await screen.findByTestId("card");
  return result;
}

function voucherParam(history: { location: { search: string } }) {
  return new URLSearchParams(history.location.search).get("voucher");
}

async function back(history: { back: () => void }) {
  await act(async () => {
    history.back();
  });
}

describe("market voucher card history", () => {
  it("closes the card on Back and leaves no voucher in the URL", async () => {
    const { history } = await renderMarket();

    fireEvent.click(screen.getByRole("button", { name: "Pin A" }));
    await waitFor(() => expect(screen.getByTestId("card").textContent).toBe(A));
    expect(history.length).toBe(2);

    await back(history);

    await waitFor(() => expect(screen.getByTestId("card").textContent).toBe("none"));
    expect(voucherParam(history)).toBeNull();
  });

  it("swaps cards in place, so Back closes rather than returning to the first", async () => {
    const { history } = await renderMarket();

    fireEvent.click(screen.getByRole("button", { name: "Pin A" }));
    await waitFor(() => expect(voucherParam(history)).toBe(A));
    fireEvent.click(screen.getByRole("button", { name: "Pin B" }));
    await waitFor(() => expect(voucherParam(history)).toBe(B));
    expect(history.length).toBe(2);

    await back(history);

    await waitFor(() => expect(screen.getByTestId("card").textContent).toBe("none"));
  });

  it("treats a tap on the open card's own pin as nothing", async () => {
    const { history } = await renderMarket();

    fireEvent.click(screen.getByRole("button", { name: "Pin A" }));
    await waitFor(() => expect(voucherParam(history)).toBe(A));
    fireEvent.click(screen.getByRole("button", { name: "Pin A" }));

    expect(history.length).toBe(2);
  });

  it("pops the entry it pushed when the card is closed", async () => {
    const { history } = await renderMarket(["/?tab=wallet", "/"]);

    fireEvent.click(screen.getByRole("button", { name: "Pin A" }));
    await waitFor(() => expect(voucherParam(history)).toBe(A));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    // A second dismissal while the first is still settling must not pop again.
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() => expect(screen.getByTestId("card").textContent).toBe("none"));
    expect(new URLSearchParams(history.location.search).get("tab")).not.toBe("wallet");
  });

  it("closes a deep-linked card in place even when another tab sits behind it", async () => {
    const { history } = await renderMarket(["/?tab=wallet", `/?voucher=${A}`]);
    expect(screen.getByTestId("card").textContent).toBe(A);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() => expect(screen.getByTestId("card").textContent).toBe("none"));
    expect(new URLSearchParams(history.location.search).get("tab")).toBe("market");
    expect(voucherParam(history)).toBeNull();
    expect(history.length).toBe(2);
  });

  it("ignores the retired voucherTab search value", () => {
    expect(parseVoucherSheetSearch({ voucher: A, voucherTab: "reviews" })).toEqual({ voucher: A });
  });

  it("closes a deep-linked card in place and stays in the app", async () => {
    const { history } = await renderMarket([`/?voucher=${A}`]);
    expect(screen.getByTestId("card").textContent).toBe(A);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() => expect(screen.getByTestId("card").textContent).toBe("none"));
    expect(voucherParam(history)).toBeNull();
    expect(history.length).toBe(1);
  });

  it("keeps the card when the market switches to the list", async () => {
    const { history } = await renderMarket([`/?voucher=${A}`]);

    fireEvent.click(screen.getByRole("link", { name: "List" }));

    await waitFor(() =>
      expect(new URLSearchParams(history.location.search).get("view")).toBe("list"),
    );
    expect(screen.getByTestId("card").textContent).toBe(A);
  });

  it("opens and closes on whichever screen it was opened, keeping that screen's search", async () => {
    const { history } = await renderMarket(["/pools/0xpool?tab=holdings"]);

    fireEvent.click(screen.getByRole("button", { name: "Pin A" }));
    await waitFor(() => expect(voucherParam(history)).toBe(A));
    expect(history.location.pathname).toBe("/pools/0xpool");
    expect(new URLSearchParams(history.location.search).get("tab")).toBe("holdings");

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() => expect(screen.getByTestId("card").textContent).toBe("none"));
    expect(history.location.pathname).toBe("/pools/0xpool");
    expect(new URLSearchParams(history.location.search).get("tab")).toBe("holdings");
  });

  it("ignores a voucher that is not an address", async () => {
    await renderMarket(["/?voucher=not-an-address"]);

    expect(screen.getByTestId("card").textContent).toBe("none");
  });

  it("is not the Market root while a card is open", () => {
    expect(isAtHomeTabRoot({ tab: "market", voucher: A })).toBe(false);
    expect(isAtHomeTabRoot({ tab: "market" })).toBe(true);
  });
});
