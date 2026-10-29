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

const RECIPIENT = "0x2b4F29a8438cc9c644F6Cf1E9C287fF2fe84674e";
const TOKEN = "0x1111111111111111111111111111111111111111";
const TX = `0x${"ab".repeat(32)}`;
const LONG_NAME = "Maria Fernanda de los Angeles Rodriguez-Hernandez Cooperativa Agricola del Sur";

const mocks = vi.hoisted(() => ({
  outcome: { kind: "pending" } as unknown,
}));

vi.mock("#/features/auth/hooks/use-otx-tracking", () => ({
  useOtxTracking: () => ({ outcome: mocks.outcome }),
}));
vi.mock("#/features/auth/hooks/use-storage-owner", () => ({ useStorageOwner: () => "0xowner" }));
vi.mock("#/features/wallet/hooks/use-address-book", () => ({
  useAddressBookRecipients: () => ({ data: [] }),
}));
vi.mock("#/features/wallet/hooks/use-recipient-resolution", () => ({
  useReverseRecipientResolution: () => ({ data: undefined }),
}));
// The message and review forms are their own surfaces.
vi.mock("#/desktop/wallet/send-share-desk", () => ({
  SendShareDesk: () => <section aria-label="Message form" />,
  RedemptionReviewDesk: () => null,
}));

import { SendReceiptDesk } from "./send-receipt-desk";

const writeText = vi.fn();

async function mount() {
  const root = createRootRoute({ component: Outlet });
  const receipt = createRoute({
    getParentRoute: () => root,
    path: "/wallet/send/receipt",
    validateSearch: (search: Record<string, unknown>) => search,
    component: SendReceiptDesk,
  });
  const router = createRouter({
    routeTree: root.addChildren([receipt]),
    history: createMemoryHistory({
      initialEntries: [
        `/wallet/send/receipt?${new URLSearchParams({
          trackingId: "t1",
          token: TOKEN,
          recipient: RECIPIENT,
          recipientLabel: LONG_NAME,
          amount: "123456789.12",
          symbol: "RIV",
        })}`,
      ],
    }),
  });
  render(<RouterProvider router={router} />);
  await screen.findByRole("heading", { level: 1 });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.outcome = { kind: "success", otx: { txHash: TX, createdAt: "2026-10-29T10:00:00Z" } };
  writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
});

afterEach(() => {
  Reflect.deleteProperty(navigator, "clipboard");
});

describe("Send receipt", () => {
  it("is a focused page titled by the outcome, with Done outside the scrolling body", async () => {
    await mount();

    expect(screen.getAllByRole("heading", { level: 1 }).map((node) => node.textContent)).toEqual([
      "Sent",
    ]);
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByRole("button", { name: "Done" }).closest(".overflow-y-auto")).toBeNull();
  });

  it("keeps the whole name and every digit of the amount, with no hover-only detail", async () => {
    await mount();

    const summary = screen.getByText("Recipient", { selector: "dt" }).closest("dl") as HTMLElement;
    expect(within(summary).getByText(LONG_NAME).closest("dd")?.className).toContain(
      "[overflow-wrap:anywhere]",
    );
    expect(within(summary).getAllByText("123456789.12 RIV").length).toBeGreaterThan(0);
    // Nothing relies on a title attribute to say what an address is.
    expect(document.querySelector("[title]")).toBeNull();
    expect(document.querySelector(".truncate")).toBeNull();
  });

  it("reveals the whole transaction hash and recipient address and copies them", async () => {
    await mount();
    const summary = screen
      .getByText("Transaction", { selector: "dt" })
      .closest("dl") as HTMLElement;

    expect(summary.textContent).not.toContain(TX);
    expect(summary.textContent).not.toContain(RECIPIENT);
    for (const button of within(summary).getAllByRole("button", { name: "Show full" })) {
      fireEvent.click(button);
    }
    expect(summary.textContent).toContain(TX);
    expect(summary.textContent).toContain(RECIPIENT);

    fireEvent.click(within(summary).getByRole("button", { name: "Copy transaction hash" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(TX));
    fireEvent.click(within(summary).getByRole("button", { name: "Copy recipient address" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(RECIPIENT));
  });

  it("shows a pending payment as pending, with no hash to copy yet", async () => {
    mocks.outcome = { kind: "pending" };
    await mount();

    expect(screen.getByRole("heading", { level: 1, name: "Sending" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Copy transaction hash" })).toBeNull();
    expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();
  });
});
