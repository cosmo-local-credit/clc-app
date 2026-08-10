import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { useConnectionMock } = vi.hoisted(() => ({ useConnectionMock: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    className,
    params,
    to,
  }: {
    children: ReactNode;
    className?: string;
    params?: { step?: string; voucherAddress?: string };
    to: string;
  }) => {
    const href = params?.voucherAddress
      ? to.replace("$voucherAddress", params.voucherAddress)
      : params?.step
        ? to.replace("$step", params.step)
        : to;
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  },
  useCanGoBack: () => false,
  useRouter: () => ({ history: { back: vi.fn() } }),
}));

vi.mock("wagmi", () => ({
  useConnection: () => useConnectionMock(),
}));

import { AllVouchersPage } from "./all-vouchers-page";

const ADDRESS = "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d" as const;

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
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

function accountToken(id: number) {
  return {
    id,
    tokenAddress: `0x${id.toString(16).padStart(40, "0")}`,
    tokenSymbol: `V${id}`,
    tokenName: `Voucher ${id}`,
    tokenDecimals: 2,
    balance: "1234",
    iconUrl: null,
    lastDateBlock: "2026-07-25T00:00:00Z",
  };
}

beforeEach(() => {
  useConnectionMock.mockReturnValue({ address: ADDRESS });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("AllVouchersPage", () => {
  it("opens voucher creation from the standard title-row button", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(successResponse({ tokens: [accountToken(1)] })),
    );
    renderWithQueryClient(<AllVouchersPage />);

    await screen.findByText("Voucher 1");
    expect(screen.getByRole("link", { name: /create/i }).getAttribute("href")).toBe(
      "/vouchers/create/voucher",
    );
    expect(screen.getByRole("link", { name: /create/i }).className).toContain("h-8");
  });

  it("shows account vouchers and expands a voucher link", async () => {
    const token = accountToken(1);
    const fetcher = vi.fn().mockResolvedValue(successResponse({ tokens: [token], last: 1 }));
    vi.stubGlobal("fetch", fetcher);
    renderWithQueryClient(<AllVouchersPage />);

    const voucherRow = await screen.findByRole("button", { name: /voucher 1/i });
    expect(screen.getByText("12.34")).toBeTruthy();
    expect(voucherRow.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(voucherRow);

    expect(voucherRow.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("link", { name: /view voucher/i }).getAttribute("href")).toBe(
      `/vouchers/${token.tokenAddress}`,
    );
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining(`/api/v2/accounts/${ADDRESS}/tokens?perPage=20`),
      expect.objectContaining({ method: "GET", cache: "no-store" }),
    );
  });

  it("lets the user retry a failed voucher request", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(errorResponse())
      .mockResolvedValueOnce(successResponse({ tokens: [] }));
    vi.stubGlobal("fetch", fetcher);
    renderWithQueryClient(<AllVouchersPage />);

    expect(await screen.findByText("Couldn't load vouchers.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(await screen.findByText("No vouchers yet.")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /create/i })).toHaveLength(2);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("appends the next voucher page and stops at the end", async () => {
    const firstPage = Array.from({ length: 20 }, (_, index) => accountToken(index + 1));
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(successResponse({ tokens: firstPage, first: 1, last: 20 }))
      .mockResolvedValueOnce(successResponse({ tokens: [accountToken(21)], first: 21, last: 21 }));
    vi.stubGlobal("fetch", fetcher);
    renderWithQueryClient(<AllVouchersPage />);

    expect(await screen.findByText("Voucher 1")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /load more/i }));

    expect(await screen.findByText("Voucher 21")).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("button", { name: /load more/i })).toBeNull());
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(`/api/v2/accounts/${ADDRESS}/tokens?perPage=20&cursor=20&next=true`),
      expect.objectContaining({ method: "GET", cache: "no-store" }),
    );
  });
});
