import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { explorerTxUrl } from "@clc/core/lib/constants/chains";

import { formatTransferDate } from "#/features/wallet/logic/transfer-display";
import { CHAIN_INFO } from "#/lib/chain";
import { ActivityPage } from "./activity-page";

const ADDRESS = "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d" as const;

type TransferFixture = {
  id: number;
  txHash: string;
  dateBlock: string;
  direction: string;
  counterpartyAddress: string;
  senderAddress: string;
  recipientAddress: string;
  tokenAddress: string;
  tokenSymbol: string;
  tokenName: string;
  tokenDecimals: number;
  amount: string;
  success: boolean;
  uoaValue?: string;
  uoa?: string;
  hasNote?: boolean;
};

function logicalActivity(transfers: readonly TransferFixture[]) {
  return transfers.map(
    ({
      direction,
      tokenAddress,
      tokenSymbol,
      tokenName,
      tokenDecimals,
      amount,
      uoaValue,
      uoa,
      ...transfer
    }) => ({
      ...transfer,
      kind:
        transfer.senderAddress === "0x0000000000000000000000000000000000000000"
          ? "creation"
          : direction === "IN"
            ? "received"
            : "sent",
      hasNote: transfer.hasNote ?? false,
      transfer: { tokenAddress, tokenSymbol, tokenName, tokenDecimals, amount, uoaValue, uoa },
    }),
  );
}

vi.mock("#/features/auth/hooks/use-storage-owner", () => ({
  useStorageOwner: () => ADDRESS.toLowerCase(),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    params,
    search,
    to: _to,
    ...props
  }: {
    children: React.ReactNode;
    params?: { voucherAddress: string };
    search: { from: string };
    to: string;
    "aria-label"?: string;
    className?: string;
  }) => (
    <a
      href={
        params
          ? `/vouchers/${params.voucherAddress}?${new URLSearchParams(search).toString()}`
          : "/"
      }
      {...props}
    >
      {children}
    </a>
  ),
}));

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ActivityPage", () => {
  it("renders one two-sided swap row and opens its indexed details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "",
        text: async () =>
          JSON.stringify({
            ok: true,
            result: {
              activity: [
                {
                  kind: "swapped",
                  id: 4000010,
                  txHash: `0x${"55".repeat(32)}`,
                  dateBlock: "2026-10-20T08:00:00Z",
                  success: true,
                  sent: {
                    tokenAddress: "0x1111111111111111111111111111111111111111",
                    tokenName: "My voucher",
                    tokenSymbol: "MY3R",
                    tokenDecimals: 6,
                    amount: "1000000",
                    uoaValue: "1",
                    uoa: "KES",
                  },
                  received: {
                    tokenAddress: "0x2222222222222222222222222222222222222222",
                    tokenName: "Kilifi voucher",
                    tokenSymbol: "KNSM2",
                    tokenDecimals: 6,
                    amount: "2000000",
                    uoaValue: "2",
                    uoa: "BAM",
                  },
                  protocolFee: {
                    tokenAddress: "0x2222222222222222222222222222222222222222",
                    tokenName: "Kilifi voucher",
                    tokenSymbol: "KNSM2",
                    tokenDecimals: 6,
                    amount: "10000",
                  },
                  poolAddresses: [
                    "0x3333333333333333333333333333333333333333",
                    "0x4444444444444444444444444444444444444444",
                  ],
                },
              ],
            },
          }),
      }),
    );

    renderWithQueryClient(<ActivityPage address={ADDRESS} />);

    const row = await screen.findByRole("button", { name: /swapped knsm2 for my3r/i });
    const rowText = row.textContent ?? "";
    expect(rowText).toContain("1 MY3R (1.00 KES)");
    expect(rowText).toContain("2 KNSM2 (2.00 BAM)");
    expect(rowText.indexOf("+2 KNSM2")).toBeLessThan(rowText.indexOf("−1 MY3R"));
    fireEvent.click(row);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Pools")).toBeTruthy();
    expect(within(dialog).getByText("Sent").parentElement?.textContent).toContain("1 MY3R");
    expect(within(dialog).getByText("Received").parentElement?.textContent).toContain("2 KNSM2");
    expect(within(dialog).getByText("Protocol fee")).toBeTruthy();
  });

  it("stages type filters and applies their canonical order", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "",
        text: async () => JSON.stringify({ ok: true, result: { activity: [] } }),
      }),
    );
    const onTypesChange = vi.fn();
    renderWithQueryClient(
      <ActivityPage address={ADDRESS} types={["sent"]} onTypesChange={onTypesChange} />,
    );

    const filters = screen.getByRole("button", { name: "Filters" });
    const search = screen.getByRole("searchbox", { name: "Search activity" });
    const searchControl = search.closest('[data-slot="market-search-control"]');
    expect(filters.className).toContain("size-11");
    expect(filters.textContent).toBe("1");
    expect(filters.textContent).not.toContain("Filters");
    expect(searchControl?.contains(filters)).toBe(true);
    expect(searchControl?.className).toContain("h-11");

    fireEvent.click(filters);
    expect(
      screen.getByRole("checkbox", { name: "Sent" }).getAttribute("data-checked"),
    ).not.toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "Creation" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Swapped" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(onTypesChange).toHaveBeenCalledWith(["creation", "sent", "swapped"]);
  });

  it("shows fetched account transfer history", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "",
        text: () =>
          Promise.resolve(
            JSON.stringify({
              ok: true,
              result: {
                activity: logicalActivity([
                  {
                    id: 743839,
                    txHash: "0xf6c12f66ae53435466ec44f33c7b981476f26779e93c725eb7b2afdf52577fcc",
                    dateBlock: "2026-07-01T12:20:29Z",
                    direction: "IN",
                    counterpartyAddress: "0x27c1B2724F9075878b5A8D19B1b056c72C16c8E4",
                    senderAddress: "0x27c1B2724F9075878b5A8D19B1b056c72C16c8E4",
                    recipientAddress: ADDRESS,
                    tokenAddress: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
                    tokenSymbol: "USD₮",
                    tokenName: "Tether USD",
                    tokenDecimals: 6,
                    amount: "1234567",
                    success: true,
                    uoaValue: "3.0864175",
                    uoa: "KES",
                  },
                ]),
              },
            }),
          ),
      }),
    );

    renderWithQueryClient(<ActivityPage address={ADDRESS} />);

    expect(await screen.findByText("Received")).toBeTruthy();
    expect(screen.getByText("1.23 USD₮")).toBeTruthy();
    expect(screen.getByText("(3.09 KES)")).toBeTruthy();
    expect(document.body.textContent).toContain("0x27c1…6c8E4");
    expect(document.body.textContent).toContain(formatTransferDate("2026-07-01T12:20:29Z"));
  });

  it("searches Core after a debounce and renders server matches without a local filter", async () => {
    const fetcher = vi.fn().mockImplementation(async (input: string) => {
      const q = new URL(input, "https://api.test").searchParams.get("q");
      const transfers =
        q === "historic"
          ? [
              {
                id: 4,
                txHash: `0x${"44".repeat(32)}`,
                dateBlock: "2020-01-01T12:00:00Z",
                direction: "IN",
                counterpartyAddress: "0x27c1B2724F9075878b5A8D19B1b056c72C16c8E4",
                senderAddress: "0x27c1B2724F9075878b5A8D19B1b056c72C16c8E4",
                recipientAddress: ADDRESS,
                tokenAddress: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
                tokenName: "Server voucher",
                tokenSymbol: "SV",
                tokenDecimals: 0,
                amount: "5",
                success: true,
                hasNote: false,
              },
            ]
          : [];
      return {
        ok: true,
        status: 200,
        statusText: "",
        text: async () =>
          JSON.stringify({ ok: true, result: { activity: logicalActivity(transfers) } }),
      };
    });
    vi.stubGlobal("fetch", fetcher);
    renderWithQueryClient(<ActivityPage address={ADDRESS} />);
    expect(await screen.findByText("No activity yet.")).toBeTruthy();
    const announcements = screen.getByRole("status");
    expect(announcements.getAttribute("aria-live")).toBe("polite");
    expect(announcements.getAttribute("aria-atomic")).toBe("true");
    const search = screen.getByRole("searchbox", { name: "Search activity" });
    fireEvent.change(search, { target: { value: "h" } });
    expect(screen.getByText("Type at least two characters.")).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(fetcher.mock.calls.some(([url]) => String(url).includes("q=h"))).toBe(false);
    fireEvent.change(search, { target: { value: "historic" } });
    expect(await screen.findByText("5 SV")).toBeTruthy();
    expect(screen.getByRole("status")).toBe(announcements);
    expect(announcements.textContent).toBe("1 activity item shown.");
    expect(fetcher.mock.calls.some(([url]) => String(url).includes("q=historic"))).toBe(true);
    fireEvent.change(search, { target: { value: "absent" } });
    await waitFor(() => expect(screen.queryByText("5 SV")).toBeNull());
    expect(await screen.findByText("No activity matches these filters.")).toBeTruthy();
    expect(screen.getByRole("status")).toBe(announcements);
    expect(announcements.textContent).toContain("No activity matches these filters.");
    expect(screen.getByRole("searchbox", { name: "Search activity" })).toBe(search);
    fireEvent.change(search, { target: { value: "" } });
    expect(await screen.findByText("No activity yet.")).toBeTruthy();
  });

  it("announces a failed activity request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Server error",
        text: async () => JSON.stringify({ ok: false, description: "Search failed" }),
      }),
    );
    renderWithQueryClient(<ActivityPage address={ADDRESS} />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Couldn't load activity.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("shows zero-address receipts as created supply", async () => {
    const zeroAddress = "0x0000000000000000000000000000000000000000";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "",
        text: () =>
          Promise.resolve(
            JSON.stringify({
              ok: true,
              result: {
                activity: logicalActivity([
                  {
                    id: 743840,
                    txHash: "0xec0810051bdd353f0d3ad60bdf6c78eef8579d8d4b19d1bd7bc4f6a73cc16783",
                    dateBlock: "2026-09-30T05:27:30Z",
                    direction: "IN",
                    counterpartyAddress: zeroAddress,
                    senderAddress: zeroAddress,
                    recipientAddress: ADDRESS,
                    tokenAddress: "0xdE67c8adFC4A61e335E8a86296CDf102A9f3C658",
                    tokenSymbol: "MY3R",
                    tokenName: "my3rd",
                    tokenDecimals: 6,
                    amount: "1000000000",
                    success: true,
                  },
                ]),
              },
            }),
          ),
      }),
    );

    renderWithQueryClient(<ActivityPage address={ADDRESS} />);

    expect(await screen.findByText("Created")).toBeTruthy();
    expect(screen.getByText("New supply")).toBeTruthy();
    expect(screen.getByText("1000 MY3R")).toBeTruthy();
    expect(document.body.textContent).not.toContain("0x0000");
  });

  it("opens transfer details in a sharp bottom sheet", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "",
        text: () =>
          Promise.resolve(
            JSON.stringify({
              ok: true,
              result: {
                activity: logicalActivity([
                  {
                    id: 743839,
                    txHash: "0xf6c12f66ae53435466ec44f33c7b981476f26779e93c725eb7b2afdf52577fcc",
                    dateBlock: "2026-07-01T12:20:29Z",
                    direction: "IN",
                    counterpartyAddress: "0x27c1B2724F9075878b5A8D19B1b056c72C16c8E4",
                    senderAddress: "0x27c1B2724F9075878b5A8D19B1b056c72C16c8E4",
                    recipientAddress: ADDRESS,
                    tokenAddress: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
                    tokenSymbol: "USD₮",
                    tokenName: "Tether USD",
                    tokenDecimals: 6,
                    amount: "1234567",
                    success: true,
                    uoaValue: "3.0864175",
                    uoa: "KES",
                  },
                ]),
              },
            }),
          ),
      }),
    );

    renderWithQueryClient(<ActivityPage address={ADDRESS} />);
    fireEvent.click(await screen.findByRole("button", { name: /received/i }));

    expect(screen.getByText("Received voucher")).toBeTruthy();
    expect(screen.getByText("Status")).toBeTruthy();
    expect(screen.getByText("Confirmed")).toBeTruthy();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("From")).toBeTruthy();
    expect(within(dialog).getByText("To")).toBeTruthy();
    expect(within(dialog).getByText("Amount").parentElement?.textContent).toContain("1.23 USD₮");
    expect(within(dialog).getByText("Amount").parentElement?.textContent).toContain("3.09 KES");
    expect(within(dialog).getByRole("link", { name: "View voucher" }).getAttribute("href")).toBe(
      "/vouchers/0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e?from=wallet",
    );
    expect(document.body.textContent).toContain(formatTransferDate("2026-07-01T12:20:29Z"));
    expect(document.body.textContent).toContain("0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d");
    // From the chain table, not a literal: this suite runs on whichever chain
    // the build points at, and "celoscan.io" passed only until one pointed at
    // Gnosis.
    expect(screen.getByRole("link", { name: "View on block explorer" })).toHaveProperty(
      "href",
      explorerTxUrl(
        CHAIN_INFO,
        "0xf6c12f66ae53435466ec44f33c7b981476f26779e93c725eb7b2afdf52577fcc",
      ),
    );
  });

  it("marks only the transfers that carry a private message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "",
        text: () =>
          Promise.resolve(
            JSON.stringify({
              ok: true,
              result: {
                activity: logicalActivity([
                  {
                    id: 743839,
                    txHash: "0xf6c12f66ae53435466ec44f33c7b981476f26779e93c725eb7b2afdf52577fcc",
                    dateBlock: "2026-07-01T12:20:29Z",
                    direction: "IN",
                    counterpartyAddress: "0x27c1B2724F9075878b5A8D19B1b056c72C16c8E4",
                    senderAddress: "0x27c1B2724F9075878b5A8D19B1b056c72C16c8E4",
                    recipientAddress: ADDRESS,
                    tokenAddress: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
                    tokenSymbol: "USD₮",
                    tokenName: "Tether USD",
                    tokenDecimals: 6,
                    amount: "1234567",
                    success: true,
                    hasNote: true,
                  },
                  {
                    id: 743838,
                    txHash: "0x0ab4f0dd3a4f4a2f8a0b6f1dbe0b5a0c1b2d3e4f5061728394a5b6c7d8e9f001",
                    dateBlock: "2026-07-01T11:02:14Z",
                    direction: "OUT",
                    counterpartyAddress: "0x27c1B2724F9075878b5A8D19B1b056c72C16c8E4",
                    senderAddress: ADDRESS,
                    recipientAddress: "0x27c1B2724F9075878b5A8D19B1b056c72C16c8E4",
                    tokenAddress: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
                    tokenSymbol: "USD₮",
                    tokenName: "Tether USD",
                    tokenDecimals: 6,
                    amount: "500000",
                    success: true,
                    hasNote: false,
                  },
                ]),
              },
            }),
          ),
      }),
    );

    renderWithQueryClient(<ActivityPage address={ADDRESS} />);

    // The badge is decorative, so the row's accessible name is what a screen
    // reader gets and what this asserts on.
    expect(await screen.findByRole("button", { name: /received.*has a message/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^sent/i })).toBeTruthy();
    expect(screen.getAllByText("Has a message")).toHaveLength(1);
  });
});
