import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const { shareState } = vi.hoisted(() => ({
  shareState: { data: null as Record<string, unknown> | null },
}));

vi.mock("#/features/wallet/hooks/use-send-share", () => ({
  useSendShare: () => ({
    data: shareState.data,
    isPending: false,
    isError: false,
    fetchStatus: "idle",
  }),
}));

vi.mock("#/components/ui/location-map.lazy", () => ({
  LocationMap: ({ lat, lng }: { lat: number; lng: number }) => (
    <div data-testid="shared-location-map">
      {lat},{lng}
    </div>
  ),
}));

import { TransferDetailsSheet, type TransferDetails } from "./transfer-details-sheet";

const TRANSFER: TransferDetails = {
  txHash: `0x${"11".repeat(32)}`,
  direction: "IN",
  recipientAddress: "0x2222222222222222222222222222222222222222",
  tokenDecimals: 6,
  tokenSymbol: "USDC",
  amount: "1000000",
  dateBlock: "2026-08-04T12:00:00Z",
  success: true,
};

afterEach(() => {
  shareState.data = null;
  vi.restoreAllMocks();
});

describe("TransferDetailsSheet private attachment", () => {
  it("renders nothing private when Core returns no attachment", () => {
    render(<TransferDetailsSheet transfer={TRANSFER} open onOpenChange={vi.fn()} />);
    expect(screen.queryByText(/private attachment/i)).toBeNull();
  });

  it("renders only the authorized note and contact fields", async () => {
    shareState.data = {
      id: 1,
      trackingId: "tracking-1",
      txHash: TRANSFER.txHash,
      permission: 7,
      note: "Meet me at the market",
      createdAt: "2026-08-04T12:00:00Z",
      sharedBy: {
        name: "Alice",
        email: "alice@example.com",
        phone: "+254712345678",
        location: { locationName: "Nairobi", lat: -1.2921, lng: 36.8219 },
      },
    };

    render(<TransferDetailsSheet transfer={TRANSFER} open onOpenChange={vi.fn()} />);

    expect(await screen.findByText("Meet me at the market")).toBeTruthy();
    expect(screen.getByRole("link", { name: "alice@example.com" }).getAttribute("href")).toBe(
      "mailto:alice@example.com",
    );
    expect(screen.getByRole("link", { name: "+254712345678" }).getAttribute("href")).toBe(
      "tel:+254712345678",
    );
    expect(screen.getByTestId("shared-location-map").textContent).toContain("-1.2921,36.8219");
  });
});
