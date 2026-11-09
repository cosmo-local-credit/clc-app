import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

/**
 * A payment relayed from one view while the layout switches to the other. The
 * view that sent it unmounts with its `mutateAsync` still out; the view that
 * mounts restores the same fields. It must stay disarmed until that relay
 * settles, or a second confirm relays a second payment.
 *
 * The real send mutation and mutation cache; only the relay call is stood in for.
 */
const SENDER = "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d";
const RECIPIENT = "0x2b4F29a8438cc9c644F6Cf1E9C287fF2fe84674e";
const RIV = "0x1111111111111111111111111111111111111111";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  relay: vi.fn(),
  upsert: { mutateAsync: vi.fn(), isPending: false },
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: { children: React.ReactNode }) => <a {...props}>{children}</a>,
  useRouter: () => ({ history: { back: vi.fn() } }),
  useCanGoBack: () => false,
  useNavigate: () => mocks.navigate,
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
    select({ location: { search: { recipient: RECIPIENT, recipientLabel: "Maria" } } }),
}));
vi.mock("wagmi", () => ({ useConnection: () => ({ address: SENDER }) }));
vi.mock("#/features/webauthn/hooks/use-calibur-delegation", () => ({
  useCaliburDelegation: () => "delegated",
}));
vi.mock("#/features/wallet/api/send-voucher-relay", () => ({ relayVoucherTransfer: mocks.relay }));
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
            ? { name: "Maria", address: RECIPIENT, source: "manual" }
            : null,
        );
      }}
    />
  ),
}));

import { LayoutSwitch } from "#/desktop/switch";
import { DESKTOP_MEDIA } from "#/desktop/layout";
import { SendDesk } from "#/desktop/wallet/send-desk";
import { SendAmountPage } from "#/features/wallet/ui/send-amount-page";
import { clearViewDrafts } from "#/lib/view-drafts";

const originalMatchMedia = window.matchMedia;
const media = { matches: false, listeners: new Set<() => void>() };

function setViewport(desktop: boolean) {
  act(() => {
    media.matches = desktop;
    for (const listener of media.listeners) listener();
  });
}

function openViewport(desktop: boolean) {
  media.matches = desktop;
  document.documentElement.dataset.layout = desktop ? "desktop" : "mobile";
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (error: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <LayoutSwitch
        mobile={<SendAmountPage token={RIV} recipient={RECIPIENT} recipientLabel="Maria" />}
        desktop={<SendDesk step="amount" token={RIV} />}
      />
    </QueryClientProvider>,
  );
}

const amountBox = () => screen.getByRole("textbox", { name: /^amount$/i }) as HTMLInputElement;

/** Starts a send in the phone view and leaves its relay out. */
async function sendFromPhone() {
  fireEvent.change(amountBox(), { target: { value: "5" } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  fireEvent.click(await screen.findByRole("button", { name: "Confirm and send" }));
  await waitFor(() => expect(mocks.relay).toHaveBeenCalledTimes(1));
}

/** Starts a send in the desktop view and leaves its relay out. */
async function sendFromDesk() {
  fireEvent.change(screen.getByRole("textbox", { name: /Recipient username/ }), {
    target: { value: RECIPIENT },
  });
  fireEvent.change(amountBox(), { target: { value: "5" } });
  fireEvent.click(screen.getByRole("button", { name: "Review" }));
  fireEvent.click(
    within(await screen.findByRole("dialog")).getByRole("button", { name: "Confirm and send" }),
  );
  await waitFor(() => expect(mocks.relay).toHaveBeenCalledTimes(1));
}

function expectDisarmed(button: HTMLElement) {
  expect((button as HTMLButtonElement).disabled).toBe(true);
  expect(button.getAttribute("aria-busy")).toBe("true");
}

function expectArmed(button: HTMLElement) {
  expect((button as HTMLButtonElement).disabled).toBe(false);
  expect(button.hasAttribute("aria-busy")).toBe(false);
}

beforeEach(() => {
  vi.clearAllMocks();
  media.matches = false;
  media.listeners.clear();
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
  vi.stubGlobal("matchMedia", originalMatchMedia);
  delete document.documentElement.dataset.layout;
  clearViewDrafts();
});

describe("a send still relaying when the layout switches", () => {
  it("keeps the desktop review disarmed until the phone's relay settles", async () => {
    const relay = deferred<{ trackingId: string; valuationSnapshots: [] }>();
    mocks.relay.mockReturnValue(relay.promise);
    openViewport(false);
    mount();
    await sendFromPhone();

    setViewport(true);

    expect(amountBox().value).toBe("5");
    const review = screen.getByRole("button", { name: "Sending…" });
    expectDisarmed(review);
    fireEvent.click(review);
    expect(screen.queryByRole("dialog")).toBeNull();

    await act(async () => {
      relay.resolve({ trackingId: "track-1", valuationSnapshots: [] });
      await relay.promise;
    });

    await waitFor(() => expectArmed(screen.getByRole("button", { name: "Review" })));
    // The phone's send finished its own way, to the receipt; nothing else was relayed.
    expect(mocks.navigate).toHaveBeenCalledWith(
      expect.objectContaining({ to: "/wallet/send/receipt" }),
    );
    expect(mocks.relay).toHaveBeenCalledTimes(1);
  });

  it("relays once when Confirm is pressed twice before the screen catches up", async () => {
    mocks.relay.mockReturnValue(deferred<never>().promise);
    openViewport(false);
    mount();
    fireEvent.change(amountBox(), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    const confirm = await screen.findByRole("button", { name: "Confirm and send" });

    // Both presses land before React re-renders the button as pending.
    act(() => {
      confirm.click();
      confirm.click();
    });

    await waitFor(() => expect(mocks.relay).toHaveBeenCalled());
    expect(mocks.relay).toHaveBeenCalledTimes(1);
  });

  it("keeps the phone's Send disarmed until the desktop's relay settles", async () => {
    const relay = deferred<never>();
    mocks.relay.mockReturnValue(relay.promise);
    openViewport(true);
    mount();
    await sendFromDesk();

    setViewport(false);

    expect(amountBox().value).toBe("5");
    const send = screen.getByRole("button", { name: "Sending…" });
    expectDisarmed(send);
    fireEvent.click(send);
    expect(screen.queryByRole("button", { name: "Confirm and send" })).toBeNull();

    await act(async () => {
      relay.reject(new Error("Relay failed"));
      await relay.promise.catch(() => undefined);
    });

    // A failed relay sent nothing, so the restored payment can be sent again.
    await waitFor(() => expectArmed(screen.getByRole("button", { name: "Send" })));
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.relay).toHaveBeenCalledTimes(1);
  });
});
