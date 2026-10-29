import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { z } from "zod";

import { PoolSidePanel, type PoolSide } from "#/desktop/pools/detail/pool-side-panel";

const POOL = "0x5c4e18f7329bb8b533e5be0d8b176ee1ed735aaa";
const TX_HASH = "0xa1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";
const SENDER = "0x1111e18f7329bb8b533e5be0d8b176ee1ed71111";
const RECIPIENT = "0x2222e18f7329bb8b533e5be0d8b176ee1ed72222";

const refs = vi.hoisted(() => ({
  model: { current: null as unknown },
  feed: { current: null as unknown },
}));

// The page's own state (URL, side panel, tabs, stacking) is what is under test;
// the queries behind it and the bodies it hosts are not.
vi.mock("#/desktop/pools/pool-main", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#/desktop/pools/pool-main")>()),
  usePoolDeskModel: () => refs.model.current,
}));
vi.mock("#/desktop/pools/pool-activity-feed", () => ({
  usePoolActivityFeed: () => refs.feed.current,
}));
vi.mock("#/desktop/pools/pool-swap-column", () => ({
  PoolSwapColumn: () => <section aria-label="Swap panel" />,
}));
vi.mock("#/desktop/pools/detail/pool-receive-popover", () => ({ PoolReceivePopover: () => null }));
vi.mock("#/components/catalogs/add-to-catalog-button", () => ({ AddToCatalogButton: () => null }));
vi.mock("#/components/safe/multisig-owner-notice", () => ({ MultisigOwnerNotice: () => null }));
vi.mock("#/features/pools/hooks/use-pool-holdings", () => ({
  usePoolHoldings: () => ({ holdings: [], unit: "KES", isPending: false }),
}));
vi.mock("#/features/pools/hooks/use-pool-fee-settings", () => ({
  usePoolFeeSettings: () => ({ data: undefined, isLoading: false }),
}));
vi.mock("#/features/pools/hooks/use-pool-recent-swaps", () => ({
  usePoolRecentSwaps: () => ({ count: 0, isError: false, isPending: false, complete: true }),
}));
vi.mock("#/desktop/pools/detail/pool-info-desk", () => ({
  PoolInfoDesk: () => <p>info body</p>,
}));
vi.mock("#/desktop/pools/detail/pool-tab-bodies", () => ({
  PoolOfferingsGrid: () => <p>offerings body</p>,
  PoolWantsTable: () => <p>wants body</p>,
  PoolVouchersTable: () => <p>vouchers body</p>,
  PoolHoldingsTable: () => <p>holdings body</p>,
  PoolCreditTable: () => <p>credit body</p>,
  PoolActivityTable: ({
    feed,
    selectedKey,
    onOpen,
  }: {
    feed: { entries: { key: string }[] };
    selectedKey: string | undefined;
    onOpen: (entry: never) => void;
  }) => (
    <div>
      {feed.entries.map((entry) => (
        <button
          key={entry.key}
          type="button"
          data-selected={selectedKey === entry.key ? "true" : undefined}
          onClick={() => onOpen(entry as never)}
        >
          {`row ${entry.key}`}
        </button>
      ))}
    </div>
  ),
}));
vi.mock("#/desktop/pools/detail/pool-manage-desk", () => ({
  PoolManageMenu: ({ onOpen }: { onOpen: (side: PoolSide) => void }) => (
    <>
      <button type="button" onClick={() => onOpen({ kind: "liquidity" })}>
        Manage
      </button>
      <button type="button" onClick={() => onOpen({ kind: "fees" })}>
        Fees
      </button>
    </>
  ),
  PoolControlSide: ({ side, onClose }: { side: PoolSide; onClose: () => void }) => (
    <PoolSidePanel
      title={side.kind === "liquidity" ? "Withdraw liquidity" : "Withdraw fees"}
      onClose={onClose}
      onSubmit={() => {}}
      footer={<button type="submit">Withdraw</button>}
    >
      <label>
        Amount
        <input />
      </label>
    </PoolSidePanel>
  ),
}));
vi.mock("#/desktop/pools/detail/pool-profile-desk", () => ({ PoolProfileSide: () => null }));
vi.mock("#/desktop/pools/detail/pool-voucher-editor-desk", () => ({
  PoolVoucherEditorSide: () => null,
}));
vi.mock("#/features/pools/hooks/use-pool-activity-details", () => ({
  legAmount: () => "10 KFP",
  usePoolActivityDetails: () => ({
    locale: "en",
    settlement: { isFetching: false, data: undefined, canLoad: false, isError: false },
    feeBreakdown: null,
    explorerUrl: "https://explorer.test/tx",
    kind: "Created",
    copy: vi.fn(),
  }),
}));

import { PoolDeskFrame } from "./pool-desk";

const ENTRY = {
  kind: "mint",
  key: "tx-1",
  txHash: TX_HASH,
  dateBlock: "2026-10-01T10:00:00Z",
  success: true,
  detail: { senderAddress: SENDER, recipientAddress: RECIPIENT },
  leg: {
    tokenAddress: "0x9d1e18f7329bb8b533e5be0d8b176ee1ed73bbbb",
    tokenSymbol: "KFP",
    tokenName: "Kilifi Voucher",
    tokenDecimals: 2,
    amount: "1000",
  },
};

type Overrides = {
  authenticated?: boolean;
  active?: boolean;
  owner?: boolean;
  isError?: boolean;
  isFetching?: boolean;
  refetch?: () => void;
};

function setModel({
  authenticated = true,
  active = true,
  owner = true,
  isError = false,
  isFetching = false,
  refetch = vi.fn(),
}: Overrides = {}) {
  refs.model.current = {
    poolAddress: POOL,
    auth: {
      isAuthenticated: authenticated,
      session: authenticated ? { address: "0xowner", role: "USER" } : undefined,
    },
    poolQuery: { isPending: false, isError, isFetching, refetch },
    pool: isError
      ? undefined
      : {
          id: 7,
          address: POOL,
          name: "Kilifi Traders",
          imageUrl: null,
          locationName: "Kilifi, Kenya",
          tags: [],
          active,
        },
    ownerInfo: { info: undefined, canManage: owner },
    poolVouchers: [],
    vouchers: [],
    canEditDetails: owner,
    canManageOnChain: owner,
    privateInfo: undefined,
  };
}

function setFeed(overrides: Partial<{ entries: unknown[]; hasNextPage: boolean }> = {}) {
  const fetchNextPage = vi.fn();
  refs.feed.current = {
    entries: [ENTRY],
    query: {
      isPending: false,
      isError: false,
      isFetching: false,
      isFetchingNextPage: false,
      hasNextPage: false,
      fetchNextPage,
      refetch: vi.fn(),
    },
    ...overrides,
  };
  if (overrides.hasNextPage !== undefined) {
    (refs.feed.current as { query: { hasNextPage: boolean } }).query.hasNextPage =
      overrides.hasNextPage;
  }
  return fetchNextPage;
}

function mount(url: string) {
  const root = createRootRoute({ component: Outlet });
  const pool = createRoute({
    getParentRoute: () => root,
    path: "/pools/$poolAddress",
    validateSearch: z.object({ tab: z.string().optional().catch(undefined) }),
    component: () => (
      <PoolDeskFrame poolAddress={POOL} side={<section aria-label="Swap panel" />} />
    ),
  });
  const elsewhere = createRoute({
    getParentRoute: () => root,
    path: "/elsewhere",
    component: () => <p>elsewhere</p>,
  });
  const history = createMemoryHistory({
    initialEntries: url.startsWith("/elsewhere") ? [url] : ["/elsewhere", url],
    initialIndex: url.startsWith("/elsewhere") ? 0 : 1,
  });
  const router = createRouter({ routeTree: root.addChildren([pool, elsewhere]), history });
  render(<RouterProvider router={router} />);
  return { router, history };
}

/** The wrapper `DeskDetail` puts the side column in. */
const sideColumn = () => screen.getByLabelText("Swap panel").closest("[class*='content-start']");

/** The canvas width `DeskDetail` reads. 800px cannot dock the 360px column; 1200px can. */
function setCanvasWidth(width: number) {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(width);
}

/** Whether `element` comes before the pool's title in the document, which is keyboard and screen-reader order. */
function precedesTitle(element: Element) {
  const title = screen.getByRole("heading", { level: 1, name: "Kilifi Traders" });
  return Boolean(element.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING);
}

beforeEach(() => {
  setModel();
  setFeed();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("pool detail loading", () => {
  it("offers Retry when the pool fails to load, and Retry reads it again", async () => {
    const refetch = vi.fn();
    setModel({ isError: true, refetch });
    mount(`/pools/${POOL}`);

    expect(await screen.findByText("Couldn't load this pool.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("shows the retry as busy while it reads", async () => {
    setModel({ isError: true, isFetching: true });
    mount(`/pools/${POOL}`);
    const retry = await screen.findByRole("button", { name: "Retry" });
    expect(retry.getAttribute("aria-busy")).toBe("true");
  });
});

describe("pool detail stacking", () => {
  it("puts the swap first, in document order too, where the column cannot dock", async () => {
    setCanvasWidth(800);
    mount(`/pools/${POOL}`);
    await screen.findByRole("heading", { level: 1, name: "Kilifi Traders" });
    expect(precedesTitle(screen.getByLabelText("Swap panel"))).toBe(true);
  });

  it("keeps the pool first beside a docked swap column", async () => {
    setCanvasWidth(1200);
    mount(`/pools/${POOL}`);
    await screen.findByRole("heading", { level: 1, name: "Kilifi Traders" });
    expect(precedesTitle(screen.getByLabelText("Swap panel"))).toBe(false);
  });

  it("keeps the pool first for a guest, who cannot swap", async () => {
    setCanvasWidth(800);
    setModel({ authenticated: false, owner: false });
    mount(`/pools/${POOL}`);
    await screen.findByRole("heading", { level: 1, name: "Kilifi Traders" });
    expect(precedesTitle(screen.getByLabelText("Swap panel"))).toBe(false);
  });

  it("keeps the pool first for a retired pool, which takes no swaps", async () => {
    setCanvasWidth(800);
    setModel({ active: false });
    mount(`/pools/${POOL}`);
    await screen.findByRole("heading", { level: 1, name: "Kilifi Traders" });
    expect(precedesTitle(screen.getByLabelText("Swap panel"))).toBe(false);
  });

  it("caps the stacked column at the form width", async () => {
    mount(`/pools/${POOL}`);
    await screen.findByRole("heading", { level: 1 });
    expect(sideColumn()?.firstElementChild?.className).toContain("max-w-[27.5rem]");
  });

  it("wraps a long name in the title rather than cutting it", async () => {
    const name = "Kilifi Coastal Cooperative Savings and Credit Swap Pool of the Northern Villages";
    setModel();
    (refs.model.current as { pool: { name: string } }).pool.name = name;
    mount(`/pools/${POOL}`);
    const title = await screen.findByRole("heading", { level: 1, name });
    expect(title.className).not.toContain("truncate");
    expect(title.parentElement?.className).toContain("[overflow-wrap:anywhere]");
  });
});

describe("pool tabs", () => {
  const tab = (name: string) => screen.getByRole("tab", { name });

  it("is a tablist with the chosen tab selected and its panel labelled by it", async () => {
    mount(`/pools/${POOL}`);
    const list = await screen.findByRole("tablist", { name: "Pool contents" });
    const tabs = within(list).getAllByRole("tab");
    expect(tabs.map((entry) => entry.textContent)).toEqual([
      "Offerings",
      "Wants",
      "Vouchers",
      "Holdings",
      "Credit",
      "Activity",
      "Info",
    ]);
    expect(tab("Offerings").getAttribute("aria-selected")).toBe("true");
    expect(tab("Wants").getAttribute("aria-selected")).toBe("false");
    // Only the chosen tab is in the page's tab order.
    expect(tab("Offerings").getAttribute("tabindex")).toBe("0");
    expect(tab("Wants").getAttribute("tabindex")).toBe("-1");

    const panel = screen.getByRole("tabpanel");
    expect(panel.getAttribute("aria-labelledby")).toBe(tab("Offerings").id);
    expect(tab("Offerings").getAttribute("aria-controls")).toBe(panel.id);
    expect(within(panel).getByText("offerings body")).toBeTruthy();
  });

  it("moves with the arrow keys, selecting as focus lands, and keeps focus on the tab", async () => {
    const { router } = mount(`/pools/${POOL}`);
    await screen.findByRole("tablist");

    tab("Offerings").focus();
    fireEvent.keyDown(tab("Offerings"), { key: "ArrowRight" });
    await waitFor(() => expect(router.state.location.search).toMatchObject({ tab: "wants" }));
    await waitFor(() => expect(tab("Wants").getAttribute("aria-selected")).toBe("true"));
    expect(document.activeElement).toBe(tab("Wants"));
    expect(within(screen.getByRole("tabpanel")).getByText("wants body")).toBeTruthy();
    expect(screen.queryByText("offerings body")).toBeNull();

    fireEvent.keyDown(tab("Wants"), { key: "ArrowRight" });
    await waitFor(() => expect(tab("Vouchers").getAttribute("aria-selected")).toBe("true"));
    expect(document.activeElement).toBe(tab("Vouchers"));

    fireEvent.keyDown(tab("Vouchers"), { key: "ArrowLeft" });
    await waitFor(() => expect(tab("Wants").getAttribute("aria-selected")).toBe("true"));
    expect(document.activeElement).toBe(tab("Wants"));
  });

  it("jumps to the ends with Home and End and wraps around", async () => {
    mount(`/pools/${POOL}`);
    await screen.findByRole("tablist");

    tab("Offerings").focus();
    fireEvent.keyDown(tab("Offerings"), { key: "End" });
    await waitFor(() => expect(tab("Info").getAttribute("aria-selected")).toBe("true"));
    expect(document.activeElement).toBe(tab("Info"));
    expect(screen.getByText("info body")).toBeTruthy();

    fireEvent.keyDown(tab("Info"), { key: "ArrowRight" });
    await waitFor(() => expect(tab("Offerings").getAttribute("aria-selected")).toBe("true"));

    fireEvent.keyDown(tab("Offerings"), { key: "ArrowLeft" });
    await waitFor(() => expect(tab("Info").getAttribute("aria-selected")).toBe("true"));

    fireEvent.keyDown(tab("Info"), { key: "Home" });
    await waitFor(() => expect(tab("Offerings").getAttribute("aria-selected")).toBe("true"));
  });

  it("keeps an open panel when another tab is chosen", async () => {
    const { router } = mount(`/pools/${POOL}?tool=liquidity`);
    await screen.findByRole("form", { name: "Withdraw liquidity" });

    fireEvent.click(tab("Wants"));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ tab: "wants" }));
    expect(router.state.location.search).toMatchObject({ tool: "liquidity" });
    expect(screen.getByRole("form", { name: "Withdraw liquidity" })).toBeTruthy();
  });

  it("shows a guest only the tabs they can read, and falls back to the first", async () => {
    setModel({ authenticated: false, owner: false });
    mount(`/pools/${POOL}?tab=credit`);
    const list = await screen.findByRole("tablist");
    expect(
      within(list)
        .getAllByRole("tab")
        .map((entry) => entry.textContent),
    ).toEqual(["Offerings", "Wants", "Vouchers", "Info"]);
    expect(tab("Offerings").getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByText("credit body")).toBeNull();
  });
});

describe("pool side panel", () => {
  it("opens an owner tool into the URL, takes focus, and gives it back on Escape", async () => {
    const { router } = mount(`/pools/${POOL}`);
    const opener = await screen.findByRole("button", { name: "Manage" });
    opener.focus();

    fireEvent.click(opener);
    const panel = await screen.findByRole("form", { name: "Withdraw liquidity" });
    expect(router.state.location.search).toMatchObject({ tool: "liquidity" });
    expect(document.activeElement).toBe(panel);
    // The panel replaced the swap in the column.
    expect(screen.queryByLabelText("Swap panel")).toBeNull();

    fireEvent.keyDown(panel, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("form", { name: "Withdraw liquidity" })).toBeNull(),
    );
    expect(router.state.location.search).not.toHaveProperty("tool");
    expect(document.activeElement).toBe(opener);
    expect(screen.getByLabelText("Swap panel")).toBeTruthy();
  });

  it("leaves Escape to a layer inside the panel that claimed it", async () => {
    mount(`/pools/${POOL}?tool=liquidity`);
    const panel = await screen.findByRole("form", { name: "Withdraw liquidity" });
    const field = within(panel).getByRole("textbox");
    field.addEventListener("keydown", (event) => event.preventDefault());

    fireEvent.keyDown(field, { key: "Escape" });
    expect(screen.getByRole("form", { name: "Withdraw liquidity" })).toBeTruthy();
  });

  it("puts a panel opened from the Back stack away with Back", async () => {
    const { router } = mount(`/pools/${POOL}`);
    fireEvent.click(await screen.findByRole("button", { name: "Manage" }));
    await screen.findByRole("form", { name: "Withdraw liquidity" });

    // Another tool replaces it, and one Back closes either.
    fireEvent.click(screen.getByRole("button", { name: "Fees" }));
    await screen.findByRole("form", { name: "Withdraw fees" });
    router.history.back();
    await waitFor(() => expect(screen.queryByRole("form")).toBeNull());
    expect(router.state.location.pathname).toBe(`/pools/${POOL}`);
  });

  it("closes a direct link to the pool page itself, not out of it", async () => {
    const { router, history } = mount(`/pools/${POOL}?tool=liquidity`);
    const panel = await screen.findByRole("form", { name: "Withdraw liquidity" });

    fireEvent.click(within(panel).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("form")).toBeNull());
    expect(router.state.location.pathname).toBe(`/pools/${POOL}`);
    expect(router.state.location.search).not.toHaveProperty("tool");
    history.back();
    await waitFor(() => expect(router.state.location.pathname).toBe("/elsewhere"));
  });

  it("shows no panel for a tool the viewer may not use, whatever the link says", async () => {
    setModel({ owner: false });
    mount(`/pools/${POOL}?tool=liquidity`);
    await screen.findByRole("heading", { level: 1, name: "Kilifi Traders" });
    expect(screen.queryByRole("form")).toBeNull();
    expect(screen.getByLabelText("Swap panel")).toBeTruthy();
  });

  it("puts the panel ahead of the pool where the column stacks", async () => {
    // A retired pool keeps the pool first, as its swap is a dead end; a panel is not.
    setCanvasWidth(800);
    setModel({ active: false });
    mount(`/pools/${POOL}?tool=liquidity`);
    const panel = await screen.findByRole("form", { name: "Withdraw liquidity" });
    expect(precedesTitle(panel)).toBe(true);
  });
});

describe("pool activity detail", () => {
  it("opens a row beside the table without taking focus when it is in view", async () => {
    const box = { top: 120, bottom: 520, left: 0, right: 360, width: 360, height: 400 } as DOMRect;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(box);
    vi.stubGlobal("innerHeight", 768);
    const { router } = mount(`/pools/${POOL}?tab=activity`);
    const row = await screen.findByRole("button", { name: "row tx-1" });
    row.focus();

    fireEvent.click(row);
    const panel = await screen.findByRole("region", { name: "Created" });
    expect(router.state.location.search).toMatchObject({ tab: "activity", entry: "tx-1" });
    // The row stays focused, so J and K keep walking the list.
    expect(document.activeElement).toBe(row);
    expect(row.getAttribute("data-selected")).toBe("true");
    expect(panel).toBeTruthy();
  });

  it("takes focus when the page has stacked it out of view, and returns it on close", async () => {
    // jsdom lays nothing out, so the panel is off screen: as when it stacks above a scrolled list.
    const { router } = mount(`/pools/${POOL}?tab=activity`);
    const row = await screen.findByRole("button", { name: "row tx-1" });
    row.focus();

    fireEvent.click(row);
    const panel = await screen.findByRole("region", { name: "Created" });
    expect(document.activeElement).toBe(panel);

    fireEvent.click(within(panel).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Created" })).toBeNull());
    expect(router.state.location.search).not.toHaveProperty("entry");
    expect(document.activeElement).toBe(row);
  });

  it("shows addresses and the hash in full on request, and copies them", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    mount(`/pools/${POOL}?tab=activity&entry=tx-1`);
    const panel = await screen.findByRole("region", { name: "Created" });

    // Short by default. A mint has no sender, so there are two values to verify: the recipient and the hash.
    expect(within(panel).queryByText(TX_HASH.slice(6, -5), { exact: false })).toBeNull();
    expect(within(panel).queryByText(RECIPIENT.slice(6, -5), { exact: false })).toBeNull();
    const reveal = within(panel).getAllByRole("button", { name: "Show full" });
    expect(reveal).toHaveLength(2);
    fireEvent.click(reveal[1]!);
    expect(within(panel).getByText(TX_HASH.slice(6, -5), { exact: false })).toBeTruthy();
    expect(reveal[1]!.getAttribute("aria-expanded")).toBe("true");
    expect(within(panel).queryByText(RECIPIENT.slice(6, -5), { exact: false })).toBeNull();

    fireEvent.click(within(panel).getByRole("button", { name: "Copy recipient address" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(RECIPIENT));
  });

  it("keeps loading older pages while the row a link names is not among them", async () => {
    const fetchNextPage = setFeed({ entries: [], hasNextPage: true });
    mount(`/pools/${POOL}?tab=activity&entry=tx-old`);
    expect(await screen.findByText("Loading activity…")).toBeTruthy();
    await waitFor(() => expect(fetchNextPage).toHaveBeenCalled());
  });

  it("says so once every page is loaded and the row is not there", async () => {
    setFeed({ entries: [], hasNextPage: false });
    const { router } = mount(`/pools/${POOL}?tab=activity&entry=tx-old`);
    expect(await screen.findByText("Activity not found.")).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
    });
    await waitFor(() => expect(screen.queryByText("Activity not found.")).toBeNull());
    expect(router.state.location.search).not.toHaveProperty("entry");
  });

  it("opens no activity panel for a guest", async () => {
    setModel({ authenticated: false, owner: false });
    mount(`/pools/${POOL}?entry=tx-1`);
    await screen.findByRole("heading", { level: 1, name: "Kilifi Traders" });
    expect(screen.queryByRole("region", { name: "Created" })).toBeNull();
  });
});
