import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

/**
 * Send across a browser zoom or window resize that crosses the desktop
 * breakpoint: the real `LayoutSwitch` swaps the phone pages for the desktop
 * panel (and back) while a payment is half entered. Real hooks and a real
 * store; only the network-backed queries and the recipient lookup are stood in
 * for.
 */
const SENDER = "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d";
const OTHER_SENDER = "0x9c0F3a1B5d6e7F8091a2B3c4D5e6F708192a3b4C";
const RECIPIENT = "0x2b4F29a8438cc9c644F6Cf1E9C287fF2fe84674e";
const RIV = "0x1111111111111111111111111111111111111111";
const BABAS = "0x2222222222222222222222222222222222222222";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  send: { mutateAsync: vi.fn(), isPending: false, error: null as Error | null },
  upsert: { mutateAsync: vi.fn(), isPending: false },
  /** The signed-in account both views read, or none for a guest. */
  account: { address: undefined as string | undefined },
  search: {} as Record<string, string>,
  tokenOrder: [] as string[],
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: { children: React.ReactNode }) => <a {...props}>{children}</a>,
  useRouter: () => ({ history: { back: vi.fn() } }),
  useCanGoBack: () => false,
  useNavigate: () => mocks.navigate,
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
    select({ location: { search: mocks.search } }),
}));
vi.mock("wagmi", () => ({ useConnection: () => ({ address: mocks.account.address }) }));
vi.mock("#/features/webauthn/hooks/use-calibur-delegation", () => ({
  useCaliburDelegation: () => "delegated",
}));
vi.mock("#/features/wallet/hooks/use-account-balances", () => ({
  useAllAccountTokens: () => ({
    tokens: [
      {
        id: 1,
        tokenAddress: RIV,
        tokenSymbol: "RIV",
        tokenName: "Riverside Voucher",
        tokenDecimals: 6,
        balance: "12345678",
        iconUrl: null,
        lastDateBlock: "2026-10-01T00:00:00Z",
      },
      {
        id: 2,
        tokenAddress: BABAS,
        tokenSymbol: "BABAS",
        tokenName: "Baba's Vouchers",
        tokenDecimals: 6,
        balance: "5000000",
        iconUrl: null,
        lastDateBlock: "2026-10-01T00:00:00Z",
      },
    ]
      .filter((token) => mocks.tokenOrder.includes(token.tokenAddress))
      .sort(
        (left, right) =>
          mocks.tokenOrder.indexOf(left.tokenAddress) -
          mocks.tokenOrder.indexOf(right.tokenAddress),
      ),
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
  useStorageOwner: () => (mocks.account.address ? mocks.account.address.toLowerCase() : "guest"),
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

/** Recipient resolution is its own component; this stands in for a resolved name. */
function RecipientStub({
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
}) {
  return (
    <input
      id={id}
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => {
        onValueChange(event.target.value);
        onRecipientChange(
          event.target.value === RECIPIENT
            ? { name: "Maria", address: RECIPIENT, source: "manual" }
            : null,
        );
      }}
    />
  );
}
vi.mock("#/desktop/wallet/send-recipient-field", () => ({ SendRecipientField: RecipientStub }));
vi.mock("#/components/wallet/recipient-address-input", () => ({
  RecipientAddressInput: RecipientStub,
}));

import { LayoutSwitch } from "#/desktop/switch";
import { DESKTOP_MEDIA } from "#/desktop/layout";
import { SendDesk } from "#/desktop/wallet/send-desk";
import { SendAmountPage } from "#/features/wallet/ui/send-amount-page";
import { SendRecipientPage } from "#/features/wallet/ui/send-recipient-page";
import { clearViewDrafts, useViewDraftStore } from "#/lib/view-drafts";

const originalMatchMedia = window.matchMedia;
const media = { matches: false, listeners: new Set<() => void>() };

function setViewport(desktop: boolean) {
  act(() => {
    media.matches = desktop;
    for (const listener of media.listeners) listener();
  });
}

/** A viewport the layout bootstrap has already classified, as on a real page load. */
function openViewport(desktop: boolean) {
  media.matches = desktop;
  document.documentElement.dataset.layout = desktop ? "desktop" : "mobile";
}

function recipientStep() {
  return <LayoutSwitch mobile={<SendRecipientPage />} desktop={<SendDesk step="recipient" />} />;
}

function amountStep() {
  return (
    <LayoutSwitch
      mobile={<SendAmountPage token={RIV} recipient={RECIPIENT} recipientLabel="Maria" />}
      desktop={<SendDesk step="amount" token={RIV} />}
    />
  );
}

const entries = () => useViewDraftStore.getState().entries;
const phoneRecipient = () =>
  screen.getByRole("textbox", { name: /Recipient username/ }) as HTMLInputElement;
const amountBox = () => screen.getByRole("textbox", { name: /^amount$/i }) as HTMLInputElement;
const deskVoucher = () => screen.getByLabelText("Voucher");

function typeRecipientAndAmount(amount: string) {
  fireEvent.change(screen.getByRole("textbox", { name: /Recipient username/ }), {
    target: { value: RECIPIENT },
  });
  fireEvent.change(amountBox(), { target: { value: amount } });
}

beforeEach(() => {
  vi.clearAllMocks();
  media.matches = false;
  media.listeners.clear();
  mocks.account.address = SENDER;
  mocks.search = {};
  mocks.tokenOrder = [RIV, BABAS];
  mocks.send.error = null;
  mocks.send.isPending = false;
  mocks.send.mutateAsync.mockResolvedValue({ trackingId: "track-1", valuationSnapshots: [] });
  mocks.upsert.mutateAsync.mockResolvedValue(undefined);
  clearViewDrafts();
  vi.stubGlobal("matchMedia", (query: string) => ({
    media: query,
    get matches() {
      return query === DESKTOP_MEDIA && media.matches;
    },
    addEventListener: (_: string, listener: () => void) => media.listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => media.listeners.delete(listener),
  }));
});

afterEach(() => {
  // Put back only matchMedia: the setup file's other stubs (ResizeObserver) must stay.
  vi.stubGlobal("matchMedia", originalMatchMedia);
  delete document.documentElement.dataset.layout;
  clearViewDrafts();
});

describe("Send across a phone/desktop view switch", () => {
  it("keeps a shortcut's amount and voucher when switching from the phone's recipient step", () => {
    mocks.search = { token: BABAS, amount: "3.25" };
    render(
      <LayoutSwitch
        mobile={<SendRecipientPage token={BABAS} amount="3.25" />}
        desktop={<SendDesk step="recipient" token={BABAS} amount="3.25" />}
      />,
    );
    fireEvent.change(phoneRecipient(), { target: { value: RECIPIENT } });

    setViewport(true);

    expect(amountBox().value).toBe("3.25");
    expect(deskVoucher().textContent).toContain("BABAS");
  });

  it.each([false, true])(
    "keeps the displayed default voucher after balances reorder (starting desktop: %s)",
    (desktop) => {
      mocks.search = { recipient: RECIPIENT, recipientLabel: "Maria" };
      openViewport(desktop);
      render(
        <LayoutSwitch
          mobile={<SendAmountPage recipient={RECIPIENT} recipientLabel="Maria" />}
          desktop={<SendDesk step="amount" />}
        />,
      );
      fireEvent.change(amountBox(), { target: { value: "2.5" } });

      mocks.tokenOrder = [BABAS, RIV];
      setViewport(!desktop);

      expect(amountBox().value).toBe("2.5");
      const picker = desktop ? screen.getByRole("button", { name: /Balance/ }) : deskVoucher();
      expect(picker.textContent).toContain("RIV");
    },
  );

  it.each([false, true])(
    "does not substitute another voucher when the displayed default disappears (starting desktop: %s)",
    (desktop) => {
      mocks.search = { recipient: RECIPIENT, recipientLabel: "Maria" };
      openViewport(desktop);
      render(
        <LayoutSwitch
          mobile={<SendAmountPage recipient={RECIPIENT} recipientLabel="Maria" />}
          desktop={<SendDesk step="amount" />}
        />,
      );
      fireEvent.change(amountBox(), { target: { value: "2.5" } });

      mocks.tokenOrder = [BABAS];
      setViewport(!desktop);

      expect(amountBox().value).toBe("2.5");
      const submit = screen.getByRole("button", { name: desktop ? "Send" : "Review" });
      expect((submit as HTMLButtonElement).disabled).toBe(true);
      expect(mocks.send.mutateAsync).not.toHaveBeenCalled();
    },
  );

  it("carries the amount and the chosen voucher from the phone's amount step to the desktop panel", async () => {
    mocks.search = { recipient: RECIPIENT, recipientLabel: "Maria" };
    render(amountStep());
    fireEvent.change(amountBox(), { target: { value: "7.5" } });
    fireEvent.click(screen.getAllByRole("button").find((b) => b.textContent?.includes("Balance"))!);
    fireEvent.click(await screen.findByRole("button", { name: /BABAS/i }));

    setViewport(true);

    expect(amountBox().value).toBe("7.5");
    expect(deskVoucher().textContent).toContain("BABAS");
    expect(
      (screen.getByRole("textbox", { name: /Recipient username/ }) as HTMLInputElement).value,
    ).toBe(RECIPIENT);
  });

  it("carries the recipient and amount from the desktop panel to the phone's recipient step, and on to the amount step", async () => {
    openViewport(true);
    render(recipientStep());
    typeRecipientAndAmount("5");

    setViewport(false);

    expect(phoneRecipient().value).toBe(RECIPIENT);
    const next = screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement;
    expect(next.disabled).toBe(false);
    fireEvent.click(next);
    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: "/wallet/send/amount",
        search: expect.objectContaining({ recipient: RECIPIENT, amount: "5" }),
      }),
    );
  });

  it("never brings back an open confirmation: nothing is sent until it is confirmed again", async () => {
    mocks.search = { recipient: RECIPIENT, recipientLabel: "Maria" };
    render(amountStep());
    fireEvent.change(amountBox(), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Confirm send")).toBeTruthy();

    setViewport(true);

    expect(amountBox().value).toBe("5");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("Confirm send")).toBeNull();
    expect(mocks.send.mutateAsync).not.toHaveBeenCalled();

    // The desktop review opens only when asked, and still needs its own confirm.
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    const dialog = await screen.findByRole("dialog");
    expect(mocks.send.mutateAsync).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm and send" }));
    await waitFor(() => expect(mocks.send.mutateAsync).toHaveBeenCalledTimes(1));
  });

  it("never brings back 'Max': the restored amount is checked as typed, not as the old balance", async () => {
    mocks.search = { recipient: RECIPIENT, recipientLabel: "Maria" };
    openViewport(true);
    render(amountStep());
    fireEvent.change(screen.getByRole("textbox", { name: /Recipient username/ }), {
      target: { value: RECIPIENT },
    });
    fireEvent.click(screen.getByRole("button", { name: "Max" }));
    // The balance is 12.345678; the field shows it to two places while "Max"
    // remembers the exact raw amount.
    const shown = amountBox().value;
    expect(shown).toMatch(/^12\.3[45]$/);

    setViewport(false);
    expect(amountBox().value).toBe(shown);
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm and send" }));

    await waitFor(() => expect(mocks.send.mutateAsync).toHaveBeenCalledTimes(1));
    // What is on screen, not the 12.345678 the old Max would have sent.
    expect(mocks.send.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        amountRaw: `${shown.replace(".", "")}0000`,
        recipientAddress: RECIPIENT,
      }),
    );
  });

  it("never brings back an open review from the desktop panel to the phone", async () => {
    mocks.search = { recipient: RECIPIENT, recipientLabel: "Maria" };
    openViewport(true);
    render(amountStep());
    fireEvent.change(screen.getByRole("textbox", { name: /Recipient username/ }), {
      target: { value: RECIPIENT },
    });
    fireEvent.change(amountBox(), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(await screen.findByRole("dialog")).toBeTruthy();

    setViewport(false);

    expect(amountBox().value).toBe("5");
    expect(screen.queryByText("Confirm send")).toBeNull();
    expect(screen.queryByRole("button", { name: "Confirm and send" })).toBeNull();
    expect(mocks.send.mutateAsync).not.toHaveBeenCalled();
  });

  it("never brings back 'Max' from the phone to the desktop panel either", async () => {
    mocks.search = { recipient: RECIPIENT, recipientLabel: "Maria" };
    render(amountStep());
    fireEvent.click(screen.getByRole("button", { name: /Use max/ }));
    const shown = amountBox().value;
    expect(shown).toMatch(/^12\.3[45]$/);

    setViewport(true);
    expect(amountBox().value).toBe(shown);
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Confirm and send" }),
    );

    await waitFor(() => expect(mocks.send.mutateAsync).toHaveBeenCalledTimes(1));
    expect(mocks.send.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ amountRaw: `${shown.replace(".", "")}0000` }),
    );
  });

  it("does not pay the URL's old recipient when the desktop draft had none resolved", () => {
    mocks.search = { recipient: RECIPIENT, recipientLabel: "Maria" };
    openViewport(true);
    render(amountStep());
    // The person replaced the recipient with something that does not resolve yet.
    fireEvent.change(screen.getByRole("textbox", { name: /Recipient username/ }), {
      target: { value: "mar" },
    });
    fireEvent.change(amountBox(), { target: { value: "5" } });

    setViewport(false);

    expect(amountBox().value).toBe("5");
    expect(screen.queryByText("Maria")).toBeNull();
    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("restores nothing to another account", () => {
    openViewport(true);
    render(recipientStep());
    typeRecipientAndAmount("5");

    mocks.account.address = OTHER_SENDER;
    setViewport(false);

    expect(phoneRecipient().value).toBe("");
  });

  it("keeps nothing for a guest", () => {
    mocks.account.address = undefined;
    openViewport(true);
    render(recipientStep());
    typeRecipientAndAmount("5");
    expect(entries()).toEqual({});

    setViewport(false);

    expect(phoneRecipient().value).toBe("");
  });

  it("forgets the draft once the payment is sent", async () => {
    openViewport(true);
    render(recipientStep());
    typeRecipientAndAmount("5");
    expect(Object.keys(entries())).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Confirm and send" }),
    );

    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith(
        expect.objectContaining({ to: "/wallet/send/receipt" }),
      ),
    );
    expect(entries()).toEqual({});
  });

  it("does not bring a payment back after the person left Send and returned in the other layout", () => {
    openViewport(false);
    const first = render(recipientStep());
    fireEvent.change(phoneRecipient(), { target: { value: RECIPIENT } });

    // Navigating away is not a switch.
    first.unmount();
    expect(entries()).toEqual({});
    openViewport(true);
    render(recipientStep());

    expect(
      (screen.getByRole("textbox", { name: /Recipient username/ }) as HTMLInputElement).value,
    ).toBe("");
  });

  it("holds only plain payment fields: no confirmation, no max, no keys", () => {
    openViewport(true);
    render(recipientStep());
    typeRecipientAndAmount("5");
    fireEvent.click(screen.getByRole("button", { name: "Max" }));
    fireEvent.click(screen.getByRole("button", { name: "Review" }));

    const [stored] = Object.values(entries());
    expect(Object.keys(stored.value as object).sort()).toEqual([
      "amount",
      "query",
      "recipient",
      "token",
    ]);
    expect(Object.keys(entries())).toEqual([`${SENDER.toLowerCase()}:send`]);
  });
});
