import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { formatTransferDate } from "#/features/wallet/logic/transfer-display";
import { ActivityPage } from "./activity-page";

const ADDRESS = "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d" as const;

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ActivityPage", () => {
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
                transfers: [
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
                  },
                ],
              },
            }),
          ),
      }),
    );

    renderWithQueryClient(<ActivityPage address={ADDRESS} />);

    expect(await screen.findByText("Received")).toBeTruthy();
    expect(screen.getByText("+ 1.23 USD₮")).toBeTruthy();
    expect(document.body.textContent).toContain("0x27c1…16c8E4");
    expect(document.body.textContent).toContain(formatTransferDate("2026-07-01T12:20:29Z"));
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
                transfers: [
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
                  },
                ],
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
    expect(screen.getByText("Recipient")).toBeTruthy();
    expect(document.body.textContent).toContain("0x1a3E…73563d");
    expect(screen.getByRole("link", { name: "View on block explorer" })).toHaveProperty(
      "href",
      "https://celoscan.io/tx/0xf6c12f66ae53435466ec44f33c7b981476f26779e93c725eb7b2afdf52577fcc",
    );
  });
});
