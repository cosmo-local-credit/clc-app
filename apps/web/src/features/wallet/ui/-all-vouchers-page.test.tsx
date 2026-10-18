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

function ownedVoucher(id: number, active = true) {
  const token = accountToken(id);
  return {
    id,
    chainId: 100,
    address: token.tokenAddress,
    name: token.tokenName,
    symbol: token.tokenSymbol,
    decimals: token.tokenDecimals,
    iconUrl: null,
    ownerAddress: ADDRESS,
    active,
  };
}

function mockReads({
  tokenPages = [{ tokens: [] }],
  ownedPages = [{ vouchers: [] }],
}: {
  tokenPages?: readonly unknown[];
  ownedPages?: readonly unknown[];
} = {}) {
  let tokenCall = 0;
  let ownedCall = 0;
  const fetcher = vi.fn().mockImplementation((url: string | URL) => {
    const href = String(url);
    if (href.includes("/api/v2/users/me/vouchers")) {
      const page = ownedPages[Math.min(ownedCall, ownedPages.length - 1)];
      ownedCall += 1;
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
      expect.stringContaining(`/api/v2/accounts/${ADDRESS}/tokens?perPage=100`),
      expect.objectContaining({ method: "GET", cache: "no-store" }),
    );
  });

  it("shows a currently owned voucher with zero when complete holdings omit it", async () => {
    mockReads({ ownedPages: [{ vouchers: [ownedVoucher(2)], last: 2 }] });
    renderPage();

    const owned = within(await screen.findByRole("region", { name: /My Vouchers/ }));
    expect(owned.getByText("Voucher 2")).toBeTruthy();
    expect(owned.getByText("0")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Holdings" })).toBeNull();
  });

  it("merges an owned positive balance exactly once", async () => {
    mockReads({
      tokenPages: [{ tokens: [accountToken(3)], last: 3 }],
      ownedPages: [{ vouchers: [ownedVoucher(3)], last: 3 }],
    });
    renderPage();

    const owned = within(await screen.findByRole("region", { name: /My Vouchers/ }));
    expect(owned.getByText("12.34")).toBeTruthy();
    expect(screen.getAllByText("Voucher 3")).toHaveLength(1);
    expect(screen.queryByRole("region", { name: "Holdings" })).toBeNull();
  });

  it("keeps retired owned vouchers visible but removes public navigation", async () => {
    mockReads({ ownedPages: [{ vouchers: [ownedVoucher(4, false)], last: 4 }] });
    renderPage();

    const row = await screen.findByRole("button", { name: /Voucher 4/i });
    expect(screen.getByText("Retired")).toBeTruthy();
    fireEvent.click(row);
    expect(screen.queryByRole("link", { name: /view voucher/i })).toBeNull();
  });

  it("keeps owned identities visible when balances fail and retries balances", async () => {
    let tokenCalls = 0;
    const fetcher = vi.fn().mockImplementation((url: string | URL) => {
      if (String(url).includes("/api/v2/users/me/vouchers")) {
        return Promise.resolve(successResponse({ vouchers: [ownedVoucher(5)], last: 5 }));
      }
      tokenCalls += 1;
      return Promise.resolve(tokenCalls === 1 ? errorResponse() : successResponse({ tokens: [] }));
    });
    vi.stubGlobal("fetch", fetcher);
    renderPage();

    expect(await screen.findByText("Voucher 5")).toBeTruthy();
    expect(screen.getByText("Unavailable")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    await waitFor(() => expect(screen.getByText("0")).toBeTruthy());
  });

  it("retries an owned-voucher failure without presenting an unverified list", async () => {
    let ownedCalls = 0;
    const fetcher = vi.fn().mockImplementation((url: string | URL) => {
      if (String(url).includes("/api/v2/users/me/vouchers")) {
        ownedCalls += 1;
        return Promise.resolve(
          ownedCalls === 1 ? errorResponse() : successResponse({ vouchers: [] }),
        );
      }
      return Promise.resolve(successResponse({ tokens: [accountToken(6)] }));
    });
    vi.stubGlobal("fetch", fetcher);
    renderPage();

    expect(await screen.findByText("Couldn't load vouchers.")).toBeTruthy();
    expect(screen.queryByText("Voucher 6")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByText("Voucher 6")).toBeTruthy();
  });

  it("drains every owned-voucher page automatically", async () => {
    const first = Array.from({ length: 100 }, (_, index) => ownedVoucher(index + 1));
    const fetcher = mockReads({
      ownedPages: [
        { vouchers: first, first: 1, last: 100 },
        { vouchers: [ownedVoucher(101)], first: 101, last: 101 },
      ],
    });
    renderPage();

    expect(await screen.findByText("Voucher 101")).toBeTruthy();
    const ownedCalls = fetcher.mock.calls.filter(([url]) =>
      String(url).includes("/api/v2/users/me/vouchers"),
    );
    expect(ownedCalls[1]?.[0]).toEqual(expect.stringContaining("perPage=100&cursor=100&next=true"));
  });

  it("uses only the authoritative owner response, not original creator metadata", async () => {
    mockReads({
      tokenPages: [{ tokens: [accountToken(8)] }],
      ownedPages: [{ vouchers: [ownedVoucher(7)] }],
    });
    renderPage();

    const owned = within(await screen.findByRole("region", { name: /My Vouchers/ }));
    const holdings = within(screen.getByRole("region", { name: "Holdings" }));
    expect(owned.getByText("Voucher 7")).toBeTruthy();
    expect(owned.queryByText("Voucher 8")).toBeNull();
    expect(holdings.getByText("Voucher 8")).toBeTruthy();
  });
});
