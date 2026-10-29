import type { AccountActivityItem } from "@clc/api/features/accounts/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { getAddress } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({ getAccountActivity: vi.fn() }));

vi.mock("#/lib/api/accounts", () => ({
  accountsClient: { getAccountActivity: mocks.getAccountActivity },
}));
vi.mock("#/features/wallet/hooks/use-recipient-resolution", () => ({
  useReverseRecipientResolution: () => ({ data: undefined }),
}));
vi.mock("#/features/wallet/hooks/use-send-share", () => ({
  useSendShare: () => ({ data: undefined, isPending: false, isError: false, fetchStatus: "idle" }),
}));

import { ActivityDesk, activityAmountSortValue, activityRowKey } from "./activity-desk";

const ACCOUNT = getAddress(`0x${"a1".repeat(20)}`);
const PEER = getAddress(`0x${"b2".repeat(20)}`);
const KFP = getAddress(`0x${"3f".repeat(20)}`);
const USDC = getAddress(`0x${"2a".repeat(20)}`);
const VCH = getAddress(`0x${"4c".repeat(20)}`);

function leg(tokenAddress: string, tokenSymbol: string, tokenDecimals: number, amount: string) {
  return { tokenAddress, tokenName: tokenSymbol, tokenSymbol, tokenDecimals, amount };
}

function transfer(
  id: number,
  kind: "sent" | "received",
  token: ReturnType<typeof leg>,
  dateBlock: string,
): AccountActivityItem {
  return {
    kind,
    id,
    txHash: `0x${id.toString(16).padStart(64, "0")}`,
    dateBlock,
    success: true,
    transfer: token,
    senderAddress: kind === "sent" ? ACCOUNT : PEER,
    recipientAddress: kind === "sent" ? PEER : ACCOUNT,
    counterpartyAddress: PEER,
    hasNote: false,
  };
}

// The same three rows read one way in raw units and another as displayed:
// raw 1000500001 > 5000 > 300, but shown 1000.5 KFP > 300 VCH > 50 USDC.
const KFP_ROW = transfer(1, "received", leg(KFP, "KFP", 6, "1000500001"), "2026-10-26T09:00:00Z");
const USDC_ROW = transfer(2, "sent", leg(USDC, "USDC", 2, "5000"), "2026-10-25T09:00:00Z");
const VCH_ROW = transfer(3, "received", leg(VCH, "VCH", 0, "300"), "2026-10-24T09:00:00Z");
const ROWS = [KFP_ROW, USDC_ROW, VCH_ROW];

function renderDesk(url: string) {
  const root = createRootRoute({ component: Outlet });
  const index = createRoute({
    getParentRoute: () => root,
    path: "/",
    validateSearch: (search: Record<string, unknown>) => search,
    component: () => <ActivityDesk address={ACCOUNT} />,
  });
  const router = createRouter({
    routeTree: root.addChildren([index]),
    history: createMemoryHistory({ initialEntries: [url] }),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

function bodyRows() {
  return screen.getAllByRole("row").slice(1);
}

function amountCells() {
  return bodyRows().map((row) => within(row).getAllByRole("cell")[3]?.textContent);
}

function readBlob(blob: Blob) {
  return new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.readAsText(blob);
  });
}

let exported: Blob | null = null;

beforeEach(() => {
  exported = null;
  mocks.getAccountActivity.mockReset().mockResolvedValue({ activity: ROWS, last: undefined });
  URL.createObjectURL = vi.fn((blob: Blob) => {
    exported = blob;
    return "blob:activity";
  });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Activity export", () => {
  it("says it exports the loaded rows, counts them, and writes their exact amounts", async () => {
    renderDesk("/?tab=activity");
    const button = await screen.findByRole("button", { name: "Export loaded rows (3)" });

    // The table shows two decimals; the file keeps every digit the chain has.
    expect(amountCells()[0]).toContain("1000.5 KFP");
    fireEvent.click(button);

    expect(exported).not.toBeNull();
    const lines = (await readBlob(exported as unknown as Blob)).split("\r\n");
    expect(lines).toHaveLength(1 + ROWS.length);
    expect(lines[1]).toContain(",received,confirmed,,,1000.500001,KFP,");
    expect(lines[2]).toContain(",sent,confirmed,50,USDC,,,");
    expect(lines[3]).toContain(",received,confirmed,,,300,VCH,");
  });

  it("exports and counts only the rows the filters leave", async () => {
    renderDesk(`/?tab=activity&activityVoucher=${USDC}`);
    const button = await screen.findByRole("button", { name: "Export loaded rows (1)" });
    expect(bodyRows()).toHaveLength(1);

    fireEvent.click(button);
    const lines = (await readBlob(exported as unknown as Blob)).split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("USDC");
  });
});

describe("Activity amount order", () => {
  it("sorts by the figure shown, with each token's decimals applied", async () => {
    // A raw-unit sort would put 300 VCH first and 50 USDC second.
    expect(ROWS.map(activityAmountSortValue)).toEqual([1000.5, 50, 300]);
    renderDesk("/?tab=activity");
    await screen.findByRole("table", { name: "Activity" });

    const amount = screen.getByRole("columnheader", { name: /Amount/ });
    fireEvent.click(within(amount).getByRole("button"));
    expect(amountCells()).toEqual(["−50 USDC", "+300 VCH", "+1000.5 KFP"]);

    fireEvent.click(within(amount).getByRole("button"));
    expect(amountCells()).toEqual(["+1000.5 KFP", "+300 VCH", "−50 USDC"]);
  });

  it("keeps the symbol in every amount cell", async () => {
    renderDesk("/?tab=activity");
    await screen.findByRole("table", { name: "Activity" });
    for (const text of amountCells()) expect(text).toMatch(/[A-Z]{3,4}$/u);
  });

  it("says a sort covers only the loaded rows while older pages can still load", async () => {
    const page = Array.from({ length: 20 }, (_, index) =>
      transfer(
        100 + index,
        "received",
        leg(KFP, "KFP", 6, `${(index + 1) * 1000000}`),
        "2026-10-20T09:00:00Z",
      ),
    );
    mocks.getAccountActivity.mockResolvedValue({ activity: page, last: 100 });
    renderDesk("/?tab=activity");
    await screen.findByRole("table", { name: "Activity" });

    const amount = screen.getByRole("columnheader", { name: /Amount/ });
    fireEvent.click(within(amount).getByRole("button"));
    expect((await screen.findByRole("status")).textContent).toContain("20 rows loaded so far");
  });

  it("makes no such claim once every row has loaded", async () => {
    renderDesk("/?tab=activity");
    await screen.findByRole("table", { name: "Activity" });
    const amount = screen.getByRole("columnheader", { name: /Amount/ });
    fireEvent.click(within(amount).getByRole("button"));
    expect(screen.queryByText(/loaded so far/u)).toBeNull();
  });
});

describe("Activity inspector close", () => {
  const key = activityRowKey(KFP_ROW);

  it("drops the inspector in place on a direct link, keeping the filters", async () => {
    const router = renderDesk(
      `/?tab=activity&activityVoucher=${KFP}&tx=${encodeURIComponent(key)}`,
    );
    const back = vi.spyOn(router.history, "back");
    fireEvent.click(await screen.findByRole("button", { name: "Close" }));

    await waitFor(() => expect(router.state.location.search).not.toHaveProperty("tx"));
    expect(router.state.location.search).toMatchObject({ tab: "activity", activityVoucher: KFP });
    // There is nothing of ours behind it to go back to, so it must not try.
    expect(back).not.toHaveBeenCalled();
    expect(router.history.canGoBack()).toBe(false);
  });

  it("goes back when this page pushed the inspector open", async () => {
    const router = renderDesk("/?tab=activity");
    const back = vi.spyOn(router.history, "back");
    const row = (await screen.findAllByRole("row"))[1] as HTMLElement;
    fireEvent.click(row);
    await waitFor(() => expect(router.state.location.search).toHaveProperty("tx"));
    expect(router.history.canGoBack()).toBe(true);

    fireEvent.click(await screen.findByRole("button", { name: "Close" }));
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty("tx"));
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("closes an overlaid inspector with Escape and gives focus back without reopening it", async () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(800);
    const router = renderDesk("/?tab=activity");
    const row = (await screen.findAllByRole("row"))[1] as HTMLElement;
    row.focus();

    const dialog = await screen.findByRole("dialog", { name: "Transfer details" });
    await waitFor(() => expect(document.activeElement).toBe(dialog));

    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(row));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(router.state.location.search).not.toHaveProperty("tx");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("Activity inspector identifiers", () => {
  it("offers the whole hash on request and copies it exactly", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderDesk(`/?tab=activity&tx=${encodeURIComponent(activityRowKey(KFP_ROW))}`);

    const panel = await screen.findByRole("complementary", { name: "Transfer details" });
    const hash = KFP_ROW.txHash;
    expect(
      within(panel).queryAllByText((_, element) => element?.textContent === hash),
    ).toHaveLength(0);

    const showFull = await within(panel).findAllByRole("button", { name: "Show full" });
    fireEvent.click(showFull[showFull.length - 1] as HTMLElement);
    expect(
      within(panel).getAllByText((_, element) => element?.textContent === hash).length,
    ).toBeGreaterThan(0);
    expect(within(panel).getByRole("button", { name: "Hide full" })).toBeTruthy();

    fireEvent.click(within(panel).getByRole("button", { name: "Copy transaction hash" }));
    expect(writeText).toHaveBeenCalledWith(hash);
  });
});
