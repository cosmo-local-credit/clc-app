import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";

import { parsePoolApproveSeed, parsePoolSideRequest, usePoolSideNavigation } from "./pool-side";

const POOL = "0x5c4e18f7329bb8b533e5be0d8b176ee1ed735aaa";
const TOKEN = "0x9d1e18f7329bb8b533e5be0d8b176ee1ed73bbbb";
/** EIP-55: the only form a link's candidate is taken in. */
const CANDIDATE = "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d";

function Harness() {
  const { request, approveSeed, open, close } = usePoolSideNavigation();
  return (
    <div>
      <p data-testid="request">{JSON.stringify(request)}</p>
      <p data-testid="seed">{JSON.stringify(approveSeed)}</p>
      <button type="button" onClick={() => open({ kind: "tool", tool: "approve" })}>
        approve
      </button>
      <button type="button" onClick={() => open({ kind: "tool", tool: "liquidity" })}>
        liquidity
      </button>
      <button type="button" onClick={() => open({ kind: "tool", tool: "feeSettings" })}>
        fee settings
      </button>
      <button type="button" onClick={() => open({ kind: "voucher", address: TOKEN })}>
        voucher
      </button>
      <button type="button" onClick={() => open({ kind: "activity", key: "tx-1" })}>
        entry
      </button>
      <button
        type="button"
        onClick={() => {
          // A row's focus and its click land together.
          open({ kind: "activity", key: "tx-2" });
          open({ kind: "activity", key: "tx-2" });
        }}
      >
        entry twice
      </button>
      <button type="button" onClick={close}>
        close
      </button>
      <button
        type="button"
        onClick={() => {
          close();
          close();
        }}
      >
        close twice
      </button>
    </div>
  );
}

/** The pool route, with whatever history the test starts from. */
function mount(initialEntries: string[], initialIndex?: number) {
  const root = createRootRoute({ component: Outlet });
  const pool = createRoute({
    getParentRoute: () => root,
    path: "/pools/$poolAddress",
    validateSearch: z.object({ tab: z.string().optional().catch(undefined) }),
    component: Harness,
  });
  const other = createRoute({
    getParentRoute: () => root,
    path: "/elsewhere",
    component: () => <p>elsewhere</p>,
  });
  const history = createMemoryHistory({ initialEntries, initialIndex });
  const router = createRouter({ routeTree: root.addChildren([pool, other]), history });
  render(<RouterProvider router={router} />);
  return { router, history };
}

const current = () => JSON.parse(screen.getByTestId("request").textContent ?? "null");
const seed = () => JSON.parse(screen.getByTestId("seed").textContent ?? "null");

describe("parsePoolSideRequest", () => {
  it("reads one panel from the URL", () => {
    expect(parsePoolSideRequest({ tool: "fee-settings" })).toEqual({
      kind: "tool",
      tool: "feeSettings",
    });
    expect(parsePoolSideRequest({ manage: TOKEN.toUpperCase().replace("0X", "0x") })).toEqual({
      kind: "voucher",
      address: TOKEN,
    });
    expect(parsePoolSideRequest({ entry: "tx-1" })).toEqual({ kind: "activity", key: "tx-1" });
  });

  it("ignores what it does not know", () => {
    expect(parsePoolSideRequest({ tool: "drop-database" })).toBeNull();
    expect(parsePoolSideRequest({ entry: "" })).toBeNull();
    expect(parsePoolSideRequest(undefined)).toBeNull();
    expect(parsePoolSideRequest({ tab: "activity" })).toBeNull();
  });
});

describe("usePoolSideNavigation", () => {
  it("pushes the first panel into the URL and Back closes it", async () => {
    const { router } = mount([`/pools/${POOL}?tab=vouchers`]);
    await screen.findByText("liquidity");

    fireEvent.click(screen.getByText("liquidity"));
    await waitFor(() => expect(current()).toEqual({ kind: "tool", tool: "liquidity" }));
    expect(router.state.location.search).toMatchObject({ tab: "vouchers", tool: "liquidity" });

    router.history.back();
    await waitFor(() => expect(current()).toBeNull());
    expect(router.state.location.search).toMatchObject({ tab: "vouchers" });
  });

  it("replaces the panel when another opens, so one Back closes either", async () => {
    const { router } = mount([`/pools/${POOL}`]);
    await screen.findByText("liquidity");

    fireEvent.click(screen.getByText("liquidity"));
    await waitFor(() => expect(current()?.tool).toBe("liquidity"));
    fireEvent.click(screen.getByText("fee settings"));
    await waitFor(() => expect(current()?.tool).toBe("feeSettings"));
    expect(router.state.location.search).toMatchObject({ tool: "fee-settings" });
    expect(router.state.location.search).not.toHaveProperty("manage");

    router.history.back();
    await waitFor(() => expect(current()).toBeNull());
    expect(router.state.location.pathname).toBe(`/pools/${POOL}`);
  });

  it("keeps one panel at a time across kinds", async () => {
    const { router } = mount([`/pools/${POOL}`]);
    await screen.findByText("voucher");

    fireEvent.click(screen.getByText("voucher"));
    await waitFor(() => expect(current()).toEqual({ kind: "voucher", address: TOKEN }));
    fireEvent.click(screen.getByText("entry"));
    await waitFor(() => expect(current()).toEqual({ kind: "activity", key: "tx-1" }));
    expect(router.state.location.search).toEqual({ entry: "tx-1" });
  });

  it("does not push twice when a row's focus and click both open it", async () => {
    const { router } = mount([`/pools/${POOL}`]);
    await screen.findByText("entry twice");

    fireEvent.click(screen.getByText("entry twice"));
    await waitFor(() => expect(current()?.key).toBe("tx-2"));
    router.history.back();
    await waitFor(() => expect(current()).toBeNull());
    expect(router.state.location.pathname).toBe(`/pools/${POOL}`);
  });

  it("closes by going back when it pushed the panel", async () => {
    const { history } = mount([`/elsewhere`, `/pools/${POOL}`], 1);
    await screen.findByText("entry");

    fireEvent.click(screen.getByText("entry"));
    await waitFor(() => expect(current()?.key).toBe("tx-1"));
    expect(history.length).toBe(3);

    fireEvent.click(screen.getByText("close"));
    await waitFor(() => expect(current()).toBeNull());
    // Back to the pool page, not past it.
    expect(history.location.pathname).toBe(`/pools/${POOL}`);
    // It popped the entry the open pushed, so Forward has the panel again.
    history.forward();
    await waitFor(() => expect(current()?.key).toBe("tx-1"));
  });

  it("closes a deep link by replacing it with the pool page, never leaving it", async () => {
    const { router, history } = mount([`/elsewhere`, `/pools/${POOL}?tab=activity&entry=tx-9`], 1);
    await waitFor(() => expect(current()).toEqual({ kind: "activity", key: "tx-9" }));

    fireEvent.click(screen.getByText("close"));
    await waitFor(() => expect(current()).toBeNull());
    expect(router.state.location.pathname).toBe(`/pools/${POOL}`);
    expect(router.state.location.search).toMatchObject({ tab: "activity" });
    expect(router.state.location.search).not.toHaveProperty("entry");
    // The entry behind it is still the page the person came from.
    expect(history.length).toBe(2);
    history.back();
    await waitFor(() => expect(router.state.location.pathname).toBe("/elsewhere"));
  });

  it("closes once however many times Close is pressed before the URL catches up", async () => {
    const { history } = mount([`/elsewhere`, `/pools/${POOL}`], 1);
    await screen.findByText("entry");
    fireEvent.click(screen.getByText("entry"));
    await waitFor(() => expect(current()?.key).toBe("tx-1"));

    fireEvent.click(screen.getByText("close twice"));
    await waitFor(() => expect(current()).toBeNull());
    expect(history.location.pathname).toBe(`/pools/${POOL}`);
  });

  it("clears all four approve params on close, and Back after a deep-linked one leaves the pool", async () => {
    const link = `/pools/${POOL}?tab=vouchers&tool=approve&candidate=${CANDIDATE}&exchangeRate=%221%22&creditLimit=%22500%22`;
    const { router, history } = mount(["/elsewhere", link], 1);
    await waitFor(() =>
      expect(seed()).toEqual({ candidate: CANDIDATE, exchangeRate: "1", creditLimit: "500" }),
    );

    fireEvent.click(screen.getByText("close"));

    await waitFor(() => expect(current()).toBeNull());
    expect(seed()).toBeNull();
    for (const key of ["tool", "candidate", "exchangeRate", "creditLimit"]) {
      expect(router.state.location.search).not.toHaveProperty(key);
    }
    expect(router.state.location.search).toMatchObject({ tab: "vouchers" });
    history.back();
    await waitFor(() => expect(router.state.location.pathname).toBe("/elsewhere"));
  });

  it("opens an in-app approve panel with no seeds, and Back closes it", async () => {
    const { router, history } = mount(["/elsewhere", `/pools/${POOL}?tab=vouchers`], 1);
    await screen.findByText("approve");

    fireEvent.click(screen.getByText("approve"));
    await waitFor(() => expect(current()).toEqual({ kind: "tool", tool: "approve" }));
    expect(seed()).toBeNull();

    history.back();
    await waitFor(() => expect(current()).toBeNull());
    expect(router.state.location.pathname).toBe(`/pools/${POOL}`);
  });
});

describe("parsePoolApproveSeed", () => {
  it("takes a checksummed candidate and quoted decimal seeds beside tool=approve", () => {
    expect(
      parsePoolApproveSeed({
        tool: "approve",
        candidate: CANDIDATE,
        exchangeRate: "1.25",
        creditLimit: "500",
      }),
    ).toEqual({ candidate: CANDIDATE, exchangeRate: "1.25", creditLimit: "500" });
    expect(parsePoolApproveSeed({ tool: "approve", candidate: CANDIDATE })).toEqual({
      candidate: CANDIDATE,
    });
  });

  it("ignores a candidate in any other form, and the seeds with it", () => {
    for (const candidate of [CANDIDATE.toLowerCase(), CANDIDATE.toUpperCase(), "0x1234", 7]) {
      expect(parsePoolApproveSeed({ tool: "approve", candidate, exchangeRate: "1" })).toBeNull();
    }
  });

  it("drops a seed that arrived as a bare number", () => {
    expect(
      parsePoolApproveSeed({ tool: "approve", candidate: CANDIDATE, exchangeRate: 1.5 }),
    ).toEqual({ candidate: CANDIDATE });
  });

  it("ignores the seeds when entry or manage wins over tool=approve", () => {
    expect(
      parsePoolApproveSeed({ tool: "approve", entry: "tx-1", candidate: CANDIDATE }),
    ).toBeNull();
    expect(
      parsePoolApproveSeed({ tool: "approve", manage: TOKEN, candidate: CANDIDATE }),
    ).toBeNull();
    expect(parsePoolApproveSeed({ tool: "liquidity", candidate: CANDIDATE })).toBeNull();
  });
});
