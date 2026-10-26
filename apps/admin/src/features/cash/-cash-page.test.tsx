import type { PretiumCashTransaction } from "@clc/api/features/pretium/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const api = vi.hoisted(() => ({
  getPretiumRecentTransactions: vi.fn(),
  getPretiumRates: vi.fn(),
  getPretiumLinkByAddress: vi.fn(),
  getPretiumTransactionsByAddress: vi.fn(),
  getPretiumTransactionsByPhone: vi.fn(),
}));

vi.mock("#/lib/api", () => ({ clcApi: { pretium: api } }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));

import { CashPage } from "./cash-page";

const ADDRESS = "0x0000000000000000000000000000000000000001";

function movement(overrides: Partial<PretiumCashTransaction> = {}): PretiumCashTransaction {
  return {
    kind: "onramp",
    id: 1,
    reference: "ON-1",
    status: "SUCCESS",
    mpesaConfirmation: null,
    phoneNumber: "+254712345678",
    amountUsd: "10",
    amountKes: "1300",
    txHash: "",
    tokenAddress: "",
    walletAddress: ADDRESS,
    createdAt: "2026-10-25T10:00:00Z",
    updatedAt: "2026-10-25T10:00:00Z",
    ...overrides,
  };
}

function page(onramps: PretiumCashTransaction[] = [], offramps: PretiumCashTransaction[] = []) {
  return { address: ADDRESS, onramps, offramps, totalCount: onramps.length + offramps.length };
}

beforeEach(() => {
  vi.resetAllMocks();
  api.getPretiumRecentTransactions.mockResolvedValue(page());
  api.getPretiumRates.mockResolvedValue({ buy: "130", sell: "129" });
  api.getPretiumLinkByAddress.mockResolvedValue({ linked: true, phoneNumber: "+254712345678" });
});

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CashPage search={{ q: ADDRESS }} />
    </QueryClientProvider>,
  );
}

describe("CashPage", () => {
  it.each([1, null])(
    "shows overlapping wallet and phone movements once with id %s, preserving both directions",
    async (id) => {
      const shared = movement({ id });
      const phoneOnly = movement({ id: 2, reference: "ON-2" });
      const offramp = movement({ kind: "offramp", reference: "OFF-1" });
      api.getPretiumTransactionsByAddress.mockResolvedValue(page([shared], [offramp]));
      api.getPretiumTransactionsByPhone.mockResolvedValue(page([shared, phoneOnly], [offramp]));
      renderPage();
      expect(await screen.findByText("ON-2")).toBeTruthy();
      expect(screen.getAllByText("ON-1")).toHaveLength(1);
      expect(screen.getAllByText("OFF-1")).toHaveLength(1);
    },
  );

  it("reports a link lookup failure instead of claiming the account is not linked", async () => {
    api.getPretiumTransactionsByAddress.mockResolvedValue(page([movement()]));
    api.getPretiumLinkByAddress.mockRejectedValue(new Error("Link lookup unavailable"));
    renderPage();
    expect(await screen.findByText("Link lookup unavailable")).toBeTruthy();
    expect(screen.queryByText(/Not linked/)).toBeNull();
    expect(api.getPretiumTransactionsByPhone).not.toHaveBeenCalled();
  });

  it("reports a phone ledger failure instead of presenting wallet rows as the full history", async () => {
    api.getPretiumTransactionsByAddress.mockResolvedValue(page([movement()]));
    api.getPretiumTransactionsByPhone.mockRejectedValue(new Error("Phone ledger unavailable"));
    renderPage();
    await waitFor(() => expect(api.getPretiumTransactionsByPhone).toHaveBeenCalled());
    expect(await screen.findByText("Phone ledger unavailable")).toBeTruthy();
  });
});
