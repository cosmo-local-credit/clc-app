import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const ADDRESS = "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d";

const mocks = vi.hoisted(() => ({ nfc: false }));

vi.mock("qrcode", () => ({
  default: { toDataURL: vi.fn().mockResolvedValue("data:image/png;qr") },
}));
vi.mock("wagmi", () => ({ useConnection: () => ({ address: ADDRESS }) }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    className,
  }: {
    to: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));
vi.mock("#/lib/nfc/ndef-adapter", () => ({ useWebNfcSupported: () => mocks.nfc }));
vi.mock("#/features/wallet/hooks/use-recipient-resolution", () => ({
  useReverseRecipientResolution: () => ({ data: undefined }),
}));
vi.mock("#/features/wallet/hooks/use-account-balances", () => ({
  useAccountActivityInfinite: () => ({
    data: { pages: [{ activity: [] }] },
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("#/desktop/activity/activity-desk", () => ({ activityRowKey: () => "row" }));

import { ReceiveDesk } from "./receive-desk";

const writeText = vi.fn();

beforeEach(() => {
  mocks.nfc = false;
  writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
});

afterEach(() => {
  Reflect.deleteProperty(navigator, "clipboard");
});

describe("Receive page", () => {
  it("is a focused panel: the QR, the whole address with Copy, and the network warning", async () => {
    const { container } = render(<ReceiveDesk />);

    expect(screen.getAllByRole("heading", { level: 1 }).map((node) => node.textContent)).toEqual([
      "Receive",
    ]);
    // No dimmed Wallet behind it.
    expect(screen.queryByRole("table")).toBeNull();
    expect(container.querySelector("[inert]")).toBeNull();

    const details = screen.getByRole("term").closest("dl") as HTMLElement;
    expect(details.textContent).toContain(ADDRESS);
    fireEvent.click(within(details).getByRole("button", { name: "Copy wallet address" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(ADDRESS));
    expect(
      screen.getByText(
        (_, node) =>
          node?.tagName === "P" &&
          /Only send assets on the .+ network to this address/.test(node.textContent ?? ""),
      ),
    ).toBeTruthy();
    expect(screen.getByText("No activity yet.")).toBeTruthy();
  });

  it("offers Collect by card only where this browser can read NFC", () => {
    const { unmount } = render(<ReceiveDesk />);
    expect(screen.queryByRole("link", { name: "Collect by card" })).toBeNull();
    unmount();

    mocks.nfc = true;
    render(<ReceiveDesk />);
    expect(screen.getByRole("link", { name: "Collect by card" }).getAttribute("href")).toBe(
      "/wallet/collect",
    );
  });
});
