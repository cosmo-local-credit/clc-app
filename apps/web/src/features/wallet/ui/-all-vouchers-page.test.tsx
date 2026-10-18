import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { useConnectionMock } = vi.hoisted(() => ({ useConnectionMock: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    params,
    search,
    to,
    ...rest
  }: {
    children: ReactNode;
    params?: { step?: string; voucherAddress?: string };
    search?: Record<string, string>;
    to: string;
  } & Record<string, unknown>) => {
    const href = params?.voucherAddress
      ? to.replace("$voucherAddress", params.voucherAddress)
      : params?.step
        ? to.replace("$step", params.step)
        : to;
    const query = new URLSearchParams(search).toString();
    return (
      <a href={query ? `${href}?${query}` : href} {...rest}>
        {children}
      </a>
    );
  },
  useCanGoBack: () => false,
  useRouter: () => ({ history: { back: vi.fn() } }),
}));

vi.mock("wagmi", () => ({ useConnection: () => useConnectionMock() }));
vi.mock("#/hooks/use-resource-usage", () => ({
  useResourceUsage: () => ({
    data: {
      vouchers: { used: 0, limit: 1, unlimited: false, canCreate: true },
      pools: { used: 0, limit: 1, unlimited: false, canCreate: true },
      catalogs: { used: 0, limit: 1, unlimited: false, canCreate: true },
      offers: { used: 0, limit: 0, unlimited: true, canCreate: true },
    },
    isPending: false,
    isError: false,
  }),
}));

import { AllVouchersPage } from "./all-vouchers-page";

const ADDRESS = "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d" as const;

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AllVouchersPage />
    </QueryClientProvider>,
  );
}

function successResponse(result: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: "",
    text: () => Promise.resolve(JSON.stringify({ ok: true, result })),
  };
}

function errorResponse() {
  return {
    ok: false,
    status: 500,
    statusText: "Internal Server Error",
    text: () => Promise.resolve(JSON.stringify({ ok: false, description: "Unavailable" })),
  };
}

function accountToken(id: number, balance = "1234") {
  return {
    id,
    tokenAddress: `0x${id.toString(16).padStart(40, "0")}`,
    tokenSymbol: `V${id}`,
    tokenName: `Voucher ${id}`,
    tokenDecimals: 2,
    balance,
    iconUrl: null,
    lastDateBlock: "2026-07-25T00:00:00Z",
  };
}

/**
 * Balance pages and the issued list are different reads. An issued read
 * answered with a balance page would file every balance under My Vouchers.
 */
function mockReads({
  tokenPages = [{ tokens: [] }],
  issuedPages = [{ tokens: [] }],
}: {
  tokenPages?: readonly unknown[];
  issuedPages?: readonly unknown[];
} = {}) {
  let tokenCall = 0;
  let issuedCall = 0;
  const fetcher = vi.fn().mockImplementation((url: string | URL) => {
    const href = String(url);
    if (href.includes("/tokens/issued")) {
      const page = issuedPages[Math.min(issuedCall, issuedPages.length - 1)];
      issuedCall += 1;
      return Promise.resolve(successResponse(page));
    }
    if (href.includes("/tokens")) {
      const page = tokenPages[Math.min(tokenCall, tokenPages.length - 1)];
      tokenCall += 1;
      return Promise.resolve(successResponse(page));
    }
    return Promise.resolve(successResponse({}));
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

function callsTo(fetcher: ReturnType<typeof mockReads>, path: string) {
  return fetcher.mock.calls.filter(([url]) => String(url).includes(path));
}

beforeEach(() => {
  useConnectionMock.mockReturnValue({ address: ADDRESS });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("AllVouchersPage", () => {
  it("keeps the title-row create action and shows the inline voucher quota", async () => {
    mockReads();
    renderPage();

    expect(await screen.findByRole("heading", { name: /My Vouchers.*0 of 1 used/ })).toBeTruthy();
    const create = screen.getByRole("link", { name: /create/i });
    expect(create.getAttribute("href")).toBe("/vouchers/create/voucher");
    expect(create.getAttribute("data-size")).toBe("default");
  });

  it("shows a positive non-owned token under Holdings and links to its voucher page", async () => {
    const token = accountToken(1);
    const fetcher = mockReads({ tokenPages: [{ tokens: [token], last: 1 }] });
    renderPage();

    const holdings = within(await screen.findByRole("region", { name: "Holdings" }));
    const row = holdings.getByRole("button", { name: /Voucher 1/i });
    expect(holdings.getByText("12.34")).toBeTruthy();
    fireEvent.click(row);
    expect(screen.getByRole("link", { name: /view voucher/i }).getAttribute("href")).toBe(
      `/vouchers/${token.tokenAddress}?from=vouchers`,
    );
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining(`/api/v2/accounts/${ADDRESS}/tokens?perPage=20`),
      expect.objectContaining({ method: "GET", cache: "no-store" }),
    );
  });

  it("lists an issued voucher whose supply was never created", async () => {
    // The opening mint failed, so the voucher has no balance anywhere and the
    // balance list never mentions it.
    const unminted = { ...accountToken(2, "0"), lastDateBlock: "0001-01-01T00:00:00Z" };
    mockReads({ issuedPages: [{ tokens: [unminted], last: 2 }] });
    renderPage();

    const owned = within(await screen.findByRole("region", { name: /My Vouchers/ }));
    expect(owned.getByText("Voucher 2")).toBeTruthy();
    expect(owned.getByText("0")).toBeTruthy();
    fireEvent.click(owned.getByRole("button", { name: /Voucher 2/i }));
    expect(owned.getByRole("link", { name: /view voucher/i }).getAttribute("href")).toBe(
      `/vouchers/${unminted.tokenAddress}?from=vouchers`,
    );
    expect(screen.queryByRole("region", { name: "Holdings" })).toBeNull();
  });

  it("lists an issued voucher once, with its own balance", async () => {
    mockReads({
      tokenPages: [{ tokens: [accountToken(3)], last: 3 }],
      issuedPages: [{ tokens: [accountToken(3)], last: 3 }],
    });
    renderPage();

    const owned = within(await screen.findByRole("region", { name: /My Vouchers/ }));
    expect(owned.getByText("12.34")).toBeTruthy();
    expect(owned.getByText("Admin")).toBeTruthy();
    expect(screen.getAllByText("Voucher 3")).toHaveLength(1);
    expect(screen.queryByRole("region", { name: "Holdings" })).toBeNull();
  });

  it("hides a retired voucher's remaining balance", async () => {
    mockReads({
      tokenPages: [{ tokens: [{ ...accountToken(4), catalogActive: false }], last: 4 }],
    });
    renderPage();

    expect(await screen.findByText("No vouchers yet.")).toBeTruthy();
    expect(screen.queryByText("Voucher 4")).toBeNull();
    expect(screen.queryByRole("region", { name: "Holdings" })).toBeNull();
  });

  it("keeps issued vouchers visible when balances fail and retries balances", async () => {
    let tokenCalls = 0;
    const fetcher = vi.fn().mockImplementation((url: string | URL) => {
      if (String(url).includes("/tokens/issued")) {
        return Promise.resolve(successResponse({ tokens: [accountToken(5)], last: 5 }));
      }
      tokenCalls += 1;
      return Promise.resolve(tokenCalls === 1 ? errorResponse() : successResponse({ tokens: [] }));
    });
    vi.stubGlobal("fetch", fetcher);
    renderPage();

    expect(await screen.findByText("Voucher 5")).toBeTruthy();
    expect(screen.getByText("12.34")).toBeTruthy();
    fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: /try again/i }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("retries an issued-list failure without filing any balance", async () => {
    let issuedCalls = 0;
    const fetcher = vi.fn().mockImplementation((url: string | URL) => {
      if (String(url).includes("/tokens/issued")) {
        issuedCalls += 1;
        return Promise.resolve(
          issuedCalls === 1 ? errorResponse() : successResponse({ tokens: [] }),
        );
      }
      return Promise.resolve(successResponse({ tokens: [accountToken(6)] }));
    });
    vi.stubGlobal("fetch", fetcher);
    renderPage();

    expect(await screen.findByText("Couldn't load vouchers.")).toBeTruthy();
    expect(screen.queryByText("Voucher 6")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    const holdings = within(await screen.findByRole("region", { name: "Holdings" }));
    expect(holdings.getByText("Voucher 6")).toBeTruthy();
  });

  it("drains every issued page before filing balances", async () => {
    const first = Array.from({ length: 100 }, (_, index) => accountToken(index + 1));
    const fetcher = mockReads({
      issuedPages: [
        { tokens: first, first: 1, last: 100 },
        { tokens: [accountToken(101)], first: 101, last: 101 },
      ],
    });
    renderPage();

    expect(await screen.findByText("Voucher 101")).toBeTruthy();
    expect(callsTo(fetcher, "/tokens/issued")[1]?.[0]).toEqual(
      expect.stringContaining("perPage=100&cursor=100&next=true"),
    );
  });

  it("appends the next page of Holdings and stops at the end", async () => {
    const firstPage = Array.from({ length: 20 }, (_, index) => accountToken(index + 1));
    const fetcher = mockReads({
      tokenPages: [
        { tokens: firstPage, first: 1, last: 20 },
        { tokens: [accountToken(21)], first: 21, last: 21 },
      ],
    });
    renderPage();

    expect(await screen.findByText("Voucher 1")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /load more/i }));

    expect(await screen.findByText("Voucher 21")).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("button", { name: /load more/i })).toBeNull());
    expect(callsTo(fetcher, "/tokens?")[1]?.[0]).toEqual(
      expect.stringContaining(`/api/v2/accounts/${ADDRESS}/tokens?perPage=20&cursor=20&next=true`),
    );
  }, 10_000);

  it("files a balance by the issued list alone", async () => {
    mockReads({
      tokenPages: [{ tokens: [accountToken(8)] }],
      issuedPages: [{ tokens: [accountToken(7)] }],
    });
    renderPage();

    const owned = within(await screen.findByRole("region", { name: /My Vouchers/ }));
    const holdings = within(screen.getByRole("region", { name: "Holdings" }));
    expect(owned.getByText("Voucher 7")).toBeTruthy();
    expect(owned.queryByText("Voucher 8")).toBeNull();
    expect(holdings.getByText("Voucher 8")).toBeTruthy();
  });
});
