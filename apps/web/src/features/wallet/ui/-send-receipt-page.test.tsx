import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { createShare, navigate, shareState, trackRelay, useOtxTracking } = vi.hoisted(() => ({
  createShare: vi.fn(),
  navigate: vi.fn(),
  shareState: {
    eligible: true,
    error: null as Error | null,
    isPending: false,
    isSuccess: false,
  },
  trackRelay: vi.fn(),
  useOtxTracking: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: { children: ReactNode }) => <a {...props}>{children}</a>,
  useNavigate: () => navigate,
}));

vi.mock("#/features/auth/hooks/use-otx-tracking", () => ({ useOtxTracking }));

vi.mock("#/features/auth/hooks/use-profile", () => ({
  useAuthProfile: () => ({
    data: {
      email: "alice@example.com",
      phone: "+254712345678",
      locationName: "Nairobi",
      geoLat: -1.2921,
      geoLng: 36.8219,
    },
    isSuccess: true,
  }),
}));

vi.mock("#/features/wallet/hooks/use-send-share", () => ({
  useCreateSendShare: () => ({
    error: shareState.error,
    isPending: shareState.isPending,
    isSuccess: shareState.isSuccess,
    mutateAsync: createShare,
  }),
  useSendShareEligibility: () => ({
    data: shareState.eligible,
    isError: false,
    isPending: false,
  }),
}));

vi.mock("#/features/webauthn/api/relayer-client", () => ({
  createRelayerClient: () => ({ trackRelay }),
}));

import { SendReceiptPage } from "./send-receipt-page";

const RECIPIENT = "0xa316408425cF17F1827483dee621c6C3A9B5fad4";
const TX_HASH = "0x4d8ab3f71c9e052d8a7b1c6e9f0a2d3e4f5a6b7c";

beforeEach(() => {
  createShare.mockResolvedValue({ id: 1, txHash: TX_HASH });
  shareState.eligible = true;
  shareState.error = null;
  shareState.isPending = false;
  shareState.isSuccess = false;
});

afterEach(() => {
  vi.restoreAllMocks();
  navigate.mockReset();
  useOtxTracking.mockReset();
  trackRelay.mockReset();
  createShare.mockReset();
});

describe("SendReceiptPage", () => {
  it("shows a pending on-chain confirmation state while polling the relayer endpoint", async () => {
    useOtxTracking.mockReturnValue({ outcome: { kind: "pending" } });
    trackRelay.mockResolvedValue({ result: { otx: [] } });

    render(
      <SendReceiptPage trackingId="tracking-1" recipient={RECIPIENT} amount="2.13" symbol="USDC" />,
    );

    expect(screen.getByText(/waiting for on-chain confirmation/i)).toBeTruthy();
    expect(screen.getByText("2.13 USDC")).toBeTruthy();
    expect(screen.queryByText("Add a private message")).toBeNull();
    expect(useOtxTracking).toHaveBeenCalledWith(
      "tracking-1",
      expect.objectContaining({
        queryKey: "send-relay-track",
        queryFn: expect.any(Function),
      }),
    );

    const options = useOtxTracking.mock.calls[0]?.[1] as {
      queryFn: (trackingId: string) => Promise<unknown>;
    };
    await expect(options.queryFn("tracking-1")).resolves.toEqual({ otx: [] });
    expect(trackRelay).toHaveBeenCalledWith("tracking-1");
  });

  it("shows the sent receipt with a copyable transaction hash once confirmed", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    useOtxTracking.mockReturnValue({
      outcome: {
        kind: "success",
        otx: {
          id: 1,
          trackingId: "tracking-1",
          otxType: "RELAY_EXEC",
          txHash: TX_HASH,
          nonce: 1,
          replaced: false,
          createdAt: "2026-07-02T10:00:00Z",
          status: "SUCCESS",
        },
      },
    });

    render(
      <SendReceiptPage trackingId="tracking-1" recipient={RECIPIENT} amount="2.13" symbol="USDC" />,
    );

    expect(screen.getByRole("heading", { name: /^sent$/i })).toBeTruthy();
    expect(screen.getByText("−2.13 USDC").parentElement?.className).toContain("text-destructive");
    expect(screen.getByText(/submitted/i)).toBeTruthy();
    expect(screen.queryByText("2026-07-02T10:00:00Z")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /copy transaction hash/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(TX_HASH));
  });

  it("adds a private message only after the send is confirmed", async () => {
    useOtxTracking.mockReturnValue({
      outcome: {
        kind: "success",
        otx: {
          id: 1,
          trackingId: "tracking-1",
          otxType: "RELAY_EXEC",
          txHash: TX_HASH,
          nonce: 1,
          replaced: false,
          createdAt: "2026-07-02T10:00:00Z",
          status: "SUCCESS",
        },
      },
    });

    render(
      <SendReceiptPage trackingId="tracking-1" recipient={RECIPIENT} amount="2.13" symbol="USDC" />,
    );

    fireEvent.click(screen.getByText("Add a private message"));
    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "Thanks for the delivery" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /email/i }));
    fireEvent.click(screen.getByRole("button", { name: "Share" }));

    await waitFor(() =>
      expect(createShare).toHaveBeenCalledWith({
        permission: 1,
        note: "Thanks for the delivery",
      }),
    );
  });

  it("explains when the confirmed recipient cannot receive a private message", () => {
    shareState.eligible = false;
    useOtxTracking.mockReturnValue({
      outcome: {
        kind: "success",
        otx: {
          id: 1,
          trackingId: "tracking-1",
          otxType: "RELAY_EXEC",
          txHash: TX_HASH,
          nonce: 1,
          replaced: false,
          createdAt: "2026-07-02T10:00:00Z",
          status: "SUCCESS",
        },
      },
    });

    render(<SendReceiptPage trackingId="tracking-1" recipient={RECIPIENT} />);

    expect(screen.getByText(/only for registered Cosmo users/i)).toBeTruthy();
    expect(screen.queryByText("Add a private message")).toBeNull();
  });

  it("Done replaces the receipt with the Wallet destination", () => {
    useOtxTracking.mockReturnValue({
      outcome: {
        kind: "success",
        otx: {
          id: 1,
          trackingId: "tracking-1",
          otxType: "RELAY_EXEC",
          txHash: TX_HASH,
          nonce: 1,
          replaced: false,
          createdAt: "2026-07-02T10:00:00Z",
          status: "SUCCESS",
        },
      },
    });

    render(
      <SendReceiptPage trackingId="tracking-1" recipient={RECIPIENT} amount="2.13" symbol="USDC" />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^done$/i }));

    expect(navigate).toHaveBeenCalledWith({
      to: "/",
      search: { tab: "wallet" },
      replace: true,
    });
  });

  it("does not render fabricated receipt data when fields are absent", () => {
    useOtxTracking.mockReturnValue({
      outcome: {
        kind: "success",
        otx: {
          id: 1,
          trackingId: "tracking-1",
          otxType: "RELAY_EXEC",
          txHash: "",
          nonce: 1,
          replaced: false,
          createdAt: "",
          status: "SUCCESS",
        },
      },
    });

    render(<SendReceiptPage trackingId="tracking-1" />);

    expect(screen.queryByText("25.00 USDC")).toBeNull();
    expect(screen.queryByRole("button", { name: /copy transaction hash/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /celoscan/i })).toBeNull();
    expect(screen.queryByText(/^To$/)).toBeNull();
  });

  it("shows a reverted state when tracking returns an error", () => {
    useOtxTracking.mockReturnValue({ outcome: { kind: "error", error: "Transaction reverted" } });

    render(
      <SendReceiptPage trackingId="tracking-1" recipient={RECIPIENT} amount="2.13" symbol="USDC" />,
    );

    expect(screen.getAllByText(/reverted/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/transaction reverted/i)).toBeTruthy();
  });
});
