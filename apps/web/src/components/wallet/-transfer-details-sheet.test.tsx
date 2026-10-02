import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const { identity, shareState, recipients } = vi.hoisted(() => ({
  identity: {
    data: null as null | {
      name: string;
      alias: string;
      address: string;
      chainId: number;
      kind: "user";
    },
  },
  shareState: { data: null as Record<string, unknown> | null },
  recipients: { data: [] as Array<{ address: string; label: string }> },
}));

vi.mock("#/features/auth/hooks/use-storage-owner", () => ({
  useStorageOwner: () => "0xowner",
}));

vi.mock("#/features/wallet/hooks/use-address-book", () => ({
  useAddressBookRecipients: () => recipients,
}));

vi.mock("#/features/wallet/hooks/use-send-share", () => ({
  useSendShare: () => ({
    data: shareState.data,
    isPending: false,
    isError: false,
    fetchStatus: "idle",
  }),
}));

vi.mock("#/features/wallet/hooks/use-recipient-resolution", () => ({
  useReverseRecipientResolution: () => identity,
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
  identity.data = null;
  shareState.data = null;
  recipients.data = [];
  Reflect.deleteProperty(navigator, "share");
  vi.restoreAllMocks();
});

describe("TransferDetailsSheet receipt sharing", () => {
  it("shares a reopened confirmed send with its alias, amount, date and explorer link", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    recipients.data = [{ address: TRANSFER.recipientAddress.toUpperCase(), label: "Alice" }];
    render(
      <TransferDetailsSheet
        transfer={{ ...TRANSFER, direction: "OUT" }}
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Alice")).toBeTruthy();
    expect(screen.getByText("Recipient").parentElement?.textContent).toContain(
      TRANSFER.recipientAddress,
    );
    fireEvent.click(screen.getByRole("button", { name: "Share receipt" }));

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const payload = share.mock.calls[0]?.[0] as { text: string };
    expect(payload.text).toContain("I sent 1 USDC to Alice.");
    expect(payload.text).toContain(`Address: ${TRANSFER.recipientAddress}`);
    expect(payload.text).toMatch(/Aug|8/);
    expect(payload.text).toContain(`/tx/${TRANSFER.txHash}`);
  });

  it("shares received funds without claiming the user sent them", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    render(<TransferDetailsSheet transfer={TRANSFER} open onOpenChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Share receipt" }));

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(share.mock.calls[0]?.[0].text).toContain("I received 1 USDC.");
    expect(share.mock.calls[0]?.[0].text).not.toContain("I sent");
  });

  it("prefers the current backend identity while retaining the exact address", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    recipients.data = [{ address: TRANSFER.recipientAddress, label: "Old Alice" }];
    identity.data = {
      kind: "user",
      name: "Alice Updated",
      alias: "alice-new",
      address: TRANSFER.recipientAddress,
      chainId: 100,
    };

    render(
      <TransferDetailsSheet
        transfer={{ ...TRANSFER, direction: "OUT" }}
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Alice Updated").parentElement?.textContent).toBe(
      "Alice Updated (alice-new)",
    );
    expect(screen.queryByText("Old Alice")).toBeNull();
    expect(screen.getByText("Recipient").parentElement?.textContent).toContain(
      TRANSFER.recipientAddress,
    );

    fireEvent.click(screen.getByRole("button", { name: "Share receipt" }));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(share.mock.calls[0]?.[0].text).toContain("I sent 1 USDC to Alice Updated (alice-new).");
    expect(share.mock.calls[0]?.[0].text).toContain(`Address: ${TRANSFER.recipientAddress}`);
  });

  it.each([{ success: false }, { txHash: "" }])(
    "withholds receipt sharing when confirmation or the transaction hash is missing (%j)",
    (details) => {
      render(
        <TransferDetailsSheet transfer={{ ...TRANSFER, ...details }} open onOpenChange={vi.fn()} />,
      );
      expect(screen.queryByRole("button", { name: "Share receipt" })).toBeNull();
    },
  );
});

describe("TransferDetailsSheet private attachment", () => {
  it("renders nothing private when Core returns no attachment", () => {
    render(<TransferDetailsSheet transfer={TRANSFER} open onOpenChange={vi.fn()} />);
    expect(screen.queryByText(/private attachment/i)).toBeNull();
  });

  it("renders only the authorized note and contact fields", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    shareState.data = {
      id: 1,
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
    fireEvent.click(screen.getByRole("button", { name: "Share receipt" }));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const sharedText = share.mock.calls[0]?.[0].text as string;
    expect(sharedText).not.toContain("Meet me at the market");
    expect(sharedText).not.toContain("alice@example.com");
    expect(sharedText).not.toContain("+254712345678");
    expect(sharedText).not.toContain("Nairobi");
  });
});
