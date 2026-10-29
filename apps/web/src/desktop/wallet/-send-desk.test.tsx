import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const SENDER = "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d";
const RECIPIENT = "0x2b4F29a8438cc9c644F6Cf1E9C287fF2fe84674e";
const TOKEN = "0x1111111111111111111111111111111111111111";
const LONG_NAME = "Maria Fernanda de los Angeles Rodriguez-Hernandez Cooperativa Agricola del Sur";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  send: { mutateAsync: vi.fn(), isPending: false, error: null as Error | null },
  upsert: { mutateAsync: vi.fn(), isPending: false },
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
    select({ location: { search: {} } }),
}));
vi.mock("wagmi", () => ({ useConnection: () => ({ address: SENDER }) }));
vi.mock("#/features/webauthn/hooks/use-calibur-delegation", () => ({
  useCaliburDelegation: () => "delegated",
}));
vi.mock("#/features/wallet/hooks/use-account-balances", () => ({
  useAllAccountTokens: () => ({
    tokens: [
      {
        id: 1,
        tokenAddress: TOKEN,
        tokenSymbol: "RIV",
        tokenName: "Riverside Voucher",
        tokenDecimals: 2,
        balance: "1000",
        iconUrl: null,
        lastDateBlock: "2026-10-01T00:00:00Z",
      },
    ],
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
  useAccountTransfersInfinite: () => ({
    data: { pages: [] },
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("#/features/wallet/hooks/use-send-voucher-transfer", () => ({
  useSendVoucherTransfer: () => mocks.send,
}));
vi.mock("#/features/auth/hooks/use-storage-owner", () => ({
  useStorageOwner: () => SENDER.toLowerCase(),
}));
vi.mock("#/features/wallet/hooks/use-address-book", () => ({
  useAddressBookRecipients: () => ({ data: [], isPending: false }),
  useUpsertAddressBookRecipient: () => mocks.upsert,
}));
vi.mock("#/features/home/hooks/use-market-voucher-detail", () => ({
  useMarketVoucherDetail: () => ({ data: undefined, isPending: false }),
}));
vi.mock("#/features/wallet/hooks/use-recipient-resolution", () => ({
  useReverseRecipientResolution: () => ({ data: undefined }),
}));
// Recipient resolution is its own component; this stands in for a resolved name.
vi.mock("#/desktop/wallet/send-recipient-field", () => ({
  SendRecipientField: ({
    id,
    value,
    onValueChange,
    onRecipientChange,
    ariaLabel,
  }: {
    id: string;
    value: string;
    onValueChange: (value: string) => void;
    onRecipientChange: (recipient: unknown) => void;
    ariaLabel: string;
  }) => (
    <input
      id={id}
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => {
        onValueChange(event.target.value);
        onRecipientChange(
          event.target.value === RECIPIENT
            ? { name: LONG_NAME, address: RECIPIENT, source: "manual" }
            : null,
        );
      }}
    />
  ),
}));

import { SendDesk } from "./send-desk";

function mount() {
  return render(<SendDesk step="recipient" />);
}

function fill() {
  fireEvent.change(screen.getByRole("textbox", { name: /Recipient username/ }), {
    target: { value: RECIPIENT },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Amount" }), { target: { value: "5" } });
}

const writeText = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mocks.send.error = null;
  mocks.send.isPending = false;
  mocks.send.mutateAsync.mockResolvedValue({ trackingId: "track-1", valuationSnapshots: [] });
  mocks.upsert.mutateAsync.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  writeText.mockResolvedValue(undefined);
});

afterEach(() => {
  Reflect.deleteProperty(navigator, "clipboard");
});

describe("Send page", () => {
  it("is one focused page: a heading, the form and a summary, with nothing dimmed or inert", () => {
    const { container } = mount();

    expect(screen.getAllByRole("heading", { level: 1 }).map((node) => node.textContent)).toEqual([
      "Send",
    ]);
    expect(screen.queryByRole("table")).toBeNull();
    expect(container.querySelector("[inert]")).toBeNull();
    // The balance of the selected voucher sits in the summary.
    const summary = screen.getByText("Balance", { selector: "dt" }).closest("dl") as HTMLElement;
    expect(within(summary).getByText("10 RIV")).toBeTruthy();
  });

  it("keeps Review in a footer outside the scrolling form, enabled only for a complete payment", () => {
    mount();
    const review = screen.getByRole("button", { name: "Review" });

    // The action is not inside the region that scrolls, so a short window never hides it,
    // and a field or an error in that region is never covered by it.
    expect(review.closest(".overflow-y-auto")).toBeNull();
    expect(
      screen.getByRole("textbox", { name: "Amount" }).closest(".overflow-y-auto"),
    ).not.toBeNull();

    expect((review as HTMLButtonElement).disabled).toBe(true);
    fill();
    expect((review as HTMLButtonElement).disabled).toBe(false);
  });

  it("flags an amount over the balance and keeps Review off", () => {
    mount();
    fill();
    fireEvent.change(screen.getByRole("textbox", { name: "Amount" }), { target: { value: "11" } });

    expect(screen.getByRole("alert").textContent).toBe("Amount exceeds your balance");
    expect((screen.getByRole("button", { name: "Review" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("sends nothing until the sender confirms in the review", async () => {
    mount();
    fill();

    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    const dialog = await screen.findByRole("dialog");
    expect(mocks.send.mutateAsync).not.toHaveBeenCalled();

    // Cancel closes it without a payment.
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.send.mutateAsync).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Confirm and send" }),
    );
    await waitFor(() => expect(mocks.send.mutateAsync).toHaveBeenCalledTimes(1));
    expect(mocks.send.mutateAsync).toHaveBeenCalledWith({
      senderAddress: SENDER,
      tokenAddress: TOKEN,
      recipientAddress: RECIPIENT,
      amountRaw: "500",
      includeAuthorization: false,
    });
    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "/wallet/send/receipt",
          search: expect.objectContaining({ trackingId: "track-1", amount: "5", symbol: "RIV" }),
        }),
      ),
    );
  });

  it("shows the whole recipient name and address in the review, with Copy", async () => {
    mount();
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    const dialog = await screen.findByRole("dialog");

    // Nothing is cut: the name, every digit and unit, and the whole address are on screen.
    expect(within(dialog).getByText(LONG_NAME)).toBeTruthy();
    expect(dialog.textContent).toContain("5 RIV");
    expect(dialog.textContent).toContain(RECIPIENT);
    expect(dialog.querySelector(".truncate")).toBeNull();
    // The value wraps rather than scrolls or clips.
    expect(within(dialog).getByText(LONG_NAME).closest("dd")?.className).toContain(
      "[overflow-wrap:anywhere]",
    );

    fireEvent.click(within(dialog).getByRole("button", { name: "Copy recipient address" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(RECIPIENT));
  });

  it("offers the recipient's full address in the summary without a hover", () => {
    mount();
    fill();
    const summary = screen.getByText("Recipient", { selector: "dt" }).closest("dl") as HTMLElement;

    expect(summary.textContent).not.toContain(RECIPIENT);
    fireEvent.click(within(summary).getByRole("button", { name: "Show full" }));
    expect(summary.textContent).toContain(RECIPIENT);
    expect(within(summary).getByText(LONG_NAME)).toBeTruthy();
  });
});
