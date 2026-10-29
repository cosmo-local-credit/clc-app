import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

/**
 * The pool and voucher wizards across a browser zoom or window resize that
 * crosses the desktop breakpoint. The real `LayoutSwitch` swaps the phone flow
 * for the desktop wizard; both run the same form hook, so the typed fields have
 * to survive, and only the typed fields: not a logo, not an accepted agreement.
 */
const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  deployPool: vi.fn(),
  deployVoucher: vi.fn(),
  getNameAvailability: vi.fn(),
  getTakenSymbols: vi.fn(),
  account: { address: undefined as string | undefined },
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  useCanGoBack: () => false,
  useNavigate: () => mocks.navigate,
  useRouter: () => ({
    history: {
      location: { state: { __TSR_index: 1 } },
      go: vi.fn(),
      flush: vi.fn(),
      subscribe: vi.fn(() => vi.fn()),
      push: vi.fn(),
      replace: vi.fn(),
      back: vi.fn(),
      block: vi.fn(() => vi.fn()),
    },
  }),
}));
vi.mock("wagmi", () => ({
  useConnection: () => ({ address: mocks.account.address, chainId: 42220 }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }));
vi.mock("#/hooks/use-resource-usage", () => ({
  useResourceUsage: () => ({
    data: {
      vouchers: { used: 0, limit: 5, canCreate: true, unlimited: false },
      pools: { used: 0, limit: 5, canCreate: true, unlimited: false },
      catalogs: { used: 0, limit: 1, canCreate: true, unlimited: false },
      offers: { used: 0, limit: 3, canCreate: true, unlimited: false },
    },
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("#/lib/api/symbols", () => ({
  symbolsClient: { getTakenSymbols: mocks.getTakenSymbols },
}));
vi.mock("#/lib/api/names", () => ({
  namesClient: { getNameAvailability: mocks.getNameAvailability },
}));
vi.mock("#/lib/navigation/pool-create-history", () => ({
  beginPoolCreateHistory: vi.fn(),
  exitPoolCreateHistory: vi.fn(),
}));
vi.mock("#/lib/navigation/voucher-create-history", () => ({
  beginVoucherCreateHistory: vi.fn(),
  exitVoucherCreateHistory: vi.fn(),
}));
vi.mock("#/features/pools/hooks/use-pool-deployment", () => ({
  useDeployPool: () => ({ error: null, isPending: false, mutateAsync: mocks.deployPool }),
}));
vi.mock("#/features/vouchers/hooks/use-voucher-deployment", () => ({
  useDeployVoucher: () => ({ error: null, isPending: false, mutateAsync: mocks.deployVoucher }),
}));
vi.mock("#/features/auth/hooks/use-profile", () => ({
  useAuthProfile: () => ({
    data: {
      email: "steward@example.org",
      phone: "+254712345678",
      country: "KE",
      locationName: "Kilifi, Kenya",
      geoLat: -3.5107,
      geoLng: 39.9093,
    },
  }),
}));
vi.mock("#/hooks/use-deployment", () => ({
  useTokenTags: () => ({
    data: ["Agriculture", "Market"],
    isError: false,
    isPending: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("#/hooks/use-vocabulary", () => ({
  useUnitsOfAccount: () => ({ data: [], isError: false, refetch: vi.fn() }),
}));
vi.mock("#/lib/api/storage", () => ({ isStorageConfigured: true, storageClient: () => ({}) }));
vi.mock("#/components/ui/markdown-editor", () => ({ MarkdownEditor: () => <div /> }));
vi.mock("#/components/ui/location-picker", () => ({
  LocationPicker: ({ value }: { value?: { locationName: string } }) => (
    <output data-testid="location">{value?.locationName ?? "none"}</output>
  ),
}));
vi.mock("#/components/ui/location-map.lazy", () => ({ LocationMap: () => <div /> }));
// A logo is a file in flight; the stand-in shows the stored URL and can set one.
vi.mock("#/components/ui/image-upload-field", () => ({
  ImageUploadField: ({
    label,
    value,
    onChange,
  }: {
    label: string;
    value: string | null;
    onChange: (url: string | null) => void;
  }) => (
    <div>
      <span data-testid={`image-${label}`}>{value ?? ""}</span>
      <button type="button" onClick={() => onChange("blob:https://app.test/new-logo")}>
        {`Upload ${label}`}
      </button>
    </div>
  ),
}));
vi.mock("#/desktop/wallet/send-recipient-field", () => ({
  SendRecipientField: ({ id }: { id: string }) => <input id={id} aria-label="Fee recipient" />,
}));

import { LayoutSwitch } from "#/desktop/switch";
import { DESKTOP_MEDIA } from "#/desktop/layout";
import { CreatePoolDesk } from "#/desktop/pools/create-pool-desk";
import { CreateVoucherDesk } from "#/desktop/vouchers/create-voucher-desk";
import { CreatePoolFlow, type PoolCreateStep } from "#/features/pools/ui";
import { usePoolCreateDraft } from "#/features/pools/state/pool-create-draft";
import { useVoucherCreateDraft } from "#/features/vouchers/state/voucher-create-draft";
import { CreateVoucherFlow, type VoucherCreateStep } from "#/features/vouchers/ui";
import { clearViewDrafts, useViewDraftStore } from "#/lib/view-drafts";

const ALICE = "0xAbC0000000000000000000000000000000000001";
const BOB = "0xB0b0000000000000000000000000000000000002";

const originalMatchMedia = window.matchMedia;
const media = { matches: false, listeners: new Set<() => void>() };
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

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

function PoolWizard({ step }: { step: PoolCreateStep }) {
  return (
    <QueryClientProvider client={queryClient}>
      <LayoutSwitch
        mobile={<CreatePoolFlow step={step} />}
        desktop={<CreatePoolDesk step={step} />}
      />
    </QueryClientProvider>
  );
}

function VoucherWizard({ step }: { step: VoucherCreateStep }) {
  return (
    <QueryClientProvider client={queryClient}>
      <LayoutSwitch
        mobile={<CreateVoucherFlow step={step} />}
        desktop={<CreateVoucherDesk step={step} />}
      />
    </QueryClientProvider>
  );
}

const entries = () => useViewDraftStore.getState().entries;
const isDesktop = () => document.documentElement.dataset.layout === "desktop";
/** The phone and desktop views label the same field a little differently. */
const field = (phone: string, desk: string) =>
  screen.getByLabelText(isDesktop() ? desk : phone) as HTMLInputElement;
const type = (phone: string, desk: string, value: string) =>
  fireEvent.change(field(phone, desk), { target: { value } });

beforeEach(() => {
  vi.clearAllMocks();
  media.matches = false;
  media.listeners.clear();
  mocks.account.address = ALICE;
  mocks.getTakenSymbols.mockImplementation(async (kind: string, prefix: string) => ({
    kind,
    prefix,
    taken: [],
  }));
  mocks.getNameAvailability.mockImplementation(async (kind: string, name: string) => ({
    kind,
    name,
    available: true,
  }));
  mocks.deployPool.mockResolvedValue({ trackingId: "pool-1" });
  mocks.deployVoucher.mockResolvedValue({ trackingId: "voucher-1" });
  clearViewDrafts();
  usePoolCreateDraft.getState().clearDraft();
  useVoucherCreateDraft.getState().clearDraft();
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
  usePoolCreateDraft.getState().clearDraft();
  useVoucherCreateDraft.getState().clearDraft();
});

describe("Create pool across a phone/desktop view switch", () => {
  it("brings the typed name and symbol to the other view, with Advanced open for the symbol", () => {
    render(<PoolWizard step="pool" />);
    type("Pool Name", "Name", "Kilifi Growers");
    type("Pool symbol", "Symbol", "kgp1");

    setViewport(true);

    expect(field("Pool Name", "Name").value).toBe("Kilifi Growers");
    expect(screen.getByLabelText("Symbol")).toBeTruthy();
    expect((screen.getByText("Advanced").closest("details") as HTMLDetailsElement).open).toBe(true);
    expect((screen.getByLabelText("Symbol") as HTMLInputElement).value).toBe("KGP1");

    // And back.
    type("Pool Name", "Name", "Kilifi Growers Co-op");
    setViewport(false);
    expect(field("Pool Name", "Name").value).toBe("Kilifi Growers Co-op");
  });

  it("keeps the fields of a later step, but not an accepted agreement or a pending logo", async () => {
    const view = render(<PoolWizard step="pool" />);
    type("Pool Name", "Name", "Kilifi Growers");
    view.rerender(<PoolWizard step="place" />);
    type("Contact Website", "Contact website", "https://kilifi.example");
    fireEvent.click(screen.getByRole("button", { name: /Upload/ }));

    setViewport(true);
    expect(field("Contact Website", "Contact website").value).toBe("https://kilifi.example");
    // The logo is a file in flight, and the profile image that would have seeded
    // it is not re-applied behind the person's back: it starts empty.
    expect(
      Object.values(screen.getAllByTestId(/^image-/)).every((node) => node.textContent === ""),
    ).toBe(true);

    view.rerender(<PoolWizard step="review" />);
    const terms = screen.getByRole("checkbox", { name: /Accept Terms/ });
    fireEvent.click(terms);
    expect(terms.getAttribute("aria-checked")).toBe("true");

    setViewport(false);

    expect(
      screen.getByRole("checkbox", { name: /Accept Terms/ }).getAttribute("aria-checked"),
    ).toBe("false");
    expect(Object.values(entries())[0]?.value).toMatchObject({ imageUrl: "" });
    expect(JSON.stringify(entries())).not.toMatch(/blob:|data:|acceptedTerms/);
  });

  it("keeps a field the person cleared cleared, instead of seeding it from the profile again", () => {
    const view = render(<PoolWizard step="pool" />);
    type("Pool Name", "Name", "Kilifi Growers");
    view.rerender(<PoolWizard step="place" />);
    expect(field("Contact Email", "Contact email").value).toBe("steward@example.org");
    type("Contact Email", "Contact email", "");

    setViewport(true);

    expect(field("Contact Email", "Contact email").value).toBe("");
  });

  it("does not bring the form back after the person leaves and returns in the other layout", () => {
    openViewport(false);
    const first = render(<PoolWizard step="pool" />);
    type("Pool Name", "Name", "Abandoned");

    first.unmount();
    expect(entries()).toEqual({});
    openViewport(true);
    render(<PoolWizard step="pool" />);

    expect(field("Pool Name", "Name").value).not.toBe("Abandoned");
  });

  it("is scoped to the account and absent for a guest", () => {
    render(<PoolWizard step="pool" />);
    type("Pool Name", "Name", "Alice's pool");
    expect(Object.keys(entries())).toEqual([`${ALICE.toLowerCase()}:pool-create`]);

    mocks.account.address = BOB;
    setViewport(true);
    expect(field("Pool Name", "Name").value).not.toBe("Alice's pool");
  });

  it("keeps nothing for a guest", () => {
    mocks.account.address = undefined;
    render(<PoolWizard step="pool" />);
    type("Pool Name", "Name", "Typed signed out");
    expect(entries()).toEqual({});

    setViewport(true);
    expect(field("Pool Name", "Name").value).not.toBe("Typed signed out");
  });

  it("forgets the draft once the pool is published", async () => {
    const view = render(<PoolWizard step="pool" />);
    type("Pool Name", "Name", "Kilifi Growers");
    type("Pool Description", "Description", "A pool for Kilifi growers.");
    type("Pool symbol", "Symbol", "KGP1");
    view.rerender(<PoolWizard step="review" />);
    expect(Object.keys(entries())).toHaveLength(1);
    fireEvent.click(screen.getByRole("checkbox", { name: /Accept Terms/ }));

    fireEvent.click(screen.getByRole("button", { name: /Confirm (&|and) Publish/i }));

    await waitFor(() => expect(mocks.deployPool).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(entries()).toEqual({}));
  });
});

describe("Create voucher across a phone/desktop view switch", () => {
  it("brings the typed details to the other view and back", () => {
    render(<VoucherWizard step="voucher" />);
    type("Voucher Name", "Name", "Kilifi Market");
    type("Voucher Description", "Description", "Fresh food from Kilifi.");
    type("Create vouchers", "Create vouchers", "250");
    type("Voucher Symbol", "Symbol", "kmkt");
    type("Price", "Price", "5");

    setViewport(true);

    expect(field("Voucher Name", "Name").value).toBe("Kilifi Market");
    expect(field("Voucher Description", "Description").value).toBe("Fresh food from Kilifi.");
    expect(field("Create vouchers", "Create vouchers").value).toBe("250");
    expect(field("Voucher Symbol", "Symbol").value).toBe("KMKT");
    expect(field("Price", "Price").value).toBe("5");
    expect((screen.getByText("Advanced").closest("details") as HTMLDetailsElement).open).toBe(true);

    type("Voucher Name", "Name", "Kilifi Market Co-op");
    setViewport(false);
    expect(field("Voucher Name", "Name").value).toBe("Kilifi Market Co-op");
    expect(field("Price", "Price").value).toBe("5");
  });

  it("keeps the later step's fields, never a pending logo or an accepted agreement, and a cleared field stays cleared", () => {
    const view = render(<VoucherWizard step="voucher" />);
    type("Voucher Name", "Name", "Kilifi Market");
    view.rerender(<VoucherWizard step="place" />);
    expect(field("Contact Email", "Contact email").value).toBe("steward@example.org");
    type("Contact Email", "Contact email", "");
    fireEvent.click(screen.getByRole("button", { name: /Upload/ }));

    setViewport(true);
    expect(field("Contact Email", "Contact email").value).toBe("");
    expect(Object.values(entries())[0]?.value).toMatchObject({ iconUrl: "" });
    expect(JSON.stringify(entries())).not.toMatch(/blob:|data:/);

    view.rerender(<VoucherWizard step="review" />);
    const terms = screen.getAllByRole("checkbox").at(-1) as HTMLElement;
    fireEvent.click(terms);
    expect(terms.getAttribute("aria-checked")).toBe("true");

    setViewport(false);
    expect(
      (screen.getAllByRole("checkbox").at(-1) as HTMLElement).getAttribute("aria-checked"),
    ).toBe("false");
    expect(Object.values(entries())[0]?.value).toMatchObject({ iconUrl: "" });
    expect(JSON.stringify(entries())).not.toMatch(/blob:|data:|acceptedTerms/);
  });

  it("does not bring the form back after the person leaves and returns in the other layout", () => {
    openViewport(false);
    const first = render(<VoucherWizard step="voucher" />);
    type("Voucher Name", "Name", "Abandoned");

    first.unmount();
    expect(entries()).toEqual({});
    openViewport(true);
    render(<VoucherWizard step="voucher" />);

    expect(field("Voucher Name", "Name").value).not.toBe("Abandoned");
  });

  it("is scoped to the account and absent for a guest", () => {
    render(<VoucherWizard step="voucher" />);
    type("Voucher Name", "Name", "Alice's voucher");
    expect(Object.keys(entries())).toEqual([`${ALICE.toLowerCase()}:voucher-create`]);

    mocks.account.address = BOB;
    setViewport(true);
    expect(field("Voucher Name", "Name").value).not.toBe("Alice's voucher");
  });

  it("forgets the draft once the voucher is published", async () => {
    const view = render(<VoucherWizard step="voucher" />);
    type("Voucher Name", "Name", "Kilifi Market");
    type("Voucher Description", "Description", "Fresh food from Kilifi.");
    type("Voucher Symbol", "Symbol", "KMKT");
    view.rerender(<VoucherWizard step="review" />);
    expect(Object.keys(entries())).toHaveLength(1);
    fireEvent.click(screen.getAllByRole("checkbox").at(-1) as HTMLElement);

    fireEvent.click(screen.getByRole("button", { name: /Confirm (&|and) Publish/i }));

    await waitFor(() => expect(mocks.deployVoucher).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(entries()).toEqual({}));
  });

  it("keeps nothing for a guest", () => {
    mocks.account.address = undefined;
    render(<VoucherWizard step="voucher" />);
    type("Voucher Name", "Name", "Typed signed out");
    expect(entries()).toEqual({});
  });
});
