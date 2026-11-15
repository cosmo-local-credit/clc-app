import type { UploadedImage } from "@clc/api/features/images/client";
import type { PoolPrefill } from "@clc/core/features/pools/prefill";
import type { VoucherPrefill } from "@clc/core/features/vouchers/prefill";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { type ReactNode, useEffect } from "react";
import { getAddress } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

/**
 * A creation-prefill link seeding the voucher and pool wizards, across the
 * phone/desktop view switch, and the image import a link starts. The real
 * `LayoutSwitch`, form hooks, view drafts and Query cache; storage and the
 * backend are stubs.
 */
const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  importImage: vi.fn(),
  getNameAvailability: vi.fn(),
  getTakenSymbols: vi.fn(),
  profile: {} as Record<string, unknown>,
  account: { address: "0xAbC0000000000000000000000000000000000001" },
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
  useConnection: () => ({ address: mocks.account.address, chainId: 100 }),
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
vi.mock("#/lib/api/symbols", () => ({ symbolsClient: { getTakenSymbols: mocks.getTakenSymbols } }));
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
vi.mock("#/features/auth/hooks/use-profile", () => ({
  useAuthProfile: () => ({ data: mocks.profile }),
}));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({
    isAuthenticated: true,
    isLoading: false,
    session: { address: mocks.account.address },
  }),
}));
vi.mock("#/lib/api/auth", () => ({
  authClient: {
    getStorageToken: async () => ({ token: "tok", expiresAt: "2027-01-01T00:00:00Z" }),
  },
}));
vi.mock("#/lib/api/storage", () => ({
  isStorageConfigured: true,
  storageClient: () => ({
    baseUrl: "https://storage.test",
    upload: vi.fn(),
    import: mocks.importImage,
  }),
}));
vi.mock("#/hooks/use-deployment", () => ({
  tokenTagsQueryKey: ["deployments", "token-tags"],
  useTokenTags: () => ({
    data: ["Agriculture"],
    isError: false,
    isPending: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("#/hooks/use-vocabulary", () => ({
  useUnitsOfAccount: () => ({ data: [], isError: false, refetch: vi.fn() }),
}));
vi.mock("#/components/ui/markdown-editor", () => ({ MarkdownEditor: () => <div /> }));
vi.mock("#/components/ui/location-picker", () => ({
  LocationPicker: ({ value }: { value?: { locationName: string } }) => (
    <output data-testid="location">{value?.locationName ?? "none"}</output>
  ),
}));
vi.mock("#/components/ui/location-map.lazy", () => ({ LocationMap: () => <div /> }));
vi.mock("#/desktop/wallet/send-recipient-field", () => ({
  SendRecipientField: ({ id }: { id: string }) => <input id={id} aria-label="Fee recipient" />,
}));

/**
 * Both views' upload fields: they report not-busy as they mount, the way the
 * real ones may, and can start an upload, finish one, or remove the image.
 */
function UploadStandIn({
  value,
  onChange,
  onBusyChange,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  useEffect(() => onBusyChange?.(false), [onBusyChange]);
  return (
    <div>
      <span data-testid="logo">{value ?? ""}</span>
      <button type="button" onClick={() => onBusyChange?.(true)}>
        Start upload
      </button>
      <button
        type="button"
        onClick={() => {
          onChange("https://storage.test/voucher/mine_400_aaaa.webp");
          onBusyChange?.(false);
        }}
      >
        Finish upload
      </button>
      <button type="button" onClick={() => onChange(null)}>
        Remove logo
      </button>
    </div>
  );
}
vi.mock("#/components/ui/image-upload-field", () => ({ ImageUploadField: UploadStandIn }));
vi.mock("#/desktop/vouchers/create/desk-logo-field", () => ({ DeskLogoField: UploadStandIn }));

import { DESKTOP_MEDIA } from "#/desktop/layout";
import { CreatePoolDesk } from "#/desktop/pools/create-pool-desk";
import { LayoutSwitch } from "#/desktop/switch";
import { CreateVoucherDesk } from "#/desktop/vouchers/create-voucher-desk";
import { CreatePoolFlow, type PoolCreateStep } from "#/features/pools/ui";
import { usePoolCreateDraft } from "#/features/pools/state/pool-create-draft";
import { useVoucherCreateDraft } from "#/features/vouchers/state/voucher-create-draft";
import { CreateVoucherFlow, type VoucherCreateStep } from "#/features/vouchers/ui";
import { clearViewDrafts, useViewDraftStore } from "#/lib/view-drafts";

const ALICE = "0xAbC0000000000000000000000000000000000001";
const SOURCE = "https://images.example.org/v/123.jpg";
const IMPORTED = "https://storage.test/voucher/import_400_bbbb.webp";

const media = { matches: false, listeners: new Set<() => void>() };
const originalMatchMedia = window.matchMedia;
let queryClient: QueryClient;

function setViewport(desktop: boolean) {
  act(() => {
    media.matches = desktop;
    for (const listener of media.listeners) listener();
  });
}

function VoucherWizard({
  step,
  prefill = null,
}: {
  step: VoucherCreateStep;
  prefill?: VoucherPrefill | null;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <LayoutSwitch
        mobile={<CreateVoucherFlow step={step} prefill={prefill} />}
        desktop={<CreateVoucherDesk step={step} prefill={prefill} />}
      />
    </QueryClientProvider>
  );
}

function PoolWizard({
  step,
  prefill = null,
}: {
  step: PoolCreateStep;
  prefill?: PoolPrefill | null;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <LayoutSwitch
        mobile={<CreatePoolFlow step={step} prefill={prefill} />}
        desktop={<CreatePoolDesk step={step} prefill={prefill} />}
      />
    </QueryClientProvider>
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((settle, fail) => {
    resolve = settle;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const imported: UploadedImage = {
  url: IMPORTED,
  width: 400,
  height: 400,
  byteSize: 1000,
  contentType: "image/webp",
};

/** The form values the view-draft bridge holds, which is what the other view will open with. */
const saved = (scope: string) =>
  useViewDraftStore.getState().entries[`${ALICE.toLowerCase()}:${scope}`]?.value as
    | Record<string, unknown>
    | undefined;
const isDesktop = () => document.documentElement.dataset.layout === "desktop";
const field = (phone: string, desk: string) =>
  screen.getByLabelText(isDesktop() ? desk : phone) as HTMLInputElement;

const LINK: VoucherPrefill = {
  name: "Mama Mboga",
  description: "Fresh vegetables from Kibera.",
  price: "50",
  unitOfAccount: "KES",
  supply: "1000",
};

beforeEach(() => {
  vi.clearAllMocks();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  media.matches = false;
  media.listeners.clear();
  mocks.profile = {
    email: "issuer@example.org",
    phone: "+254712345678",
    preferredCurrency: "USD",
    name: "Amina",
    avatarUrl: "https://storage.test/profile/avatar.webp",
  };
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
  queryClient.clear();
  clearViewDrafts();
  usePoolCreateDraft.getState().clearDraft();
  useVoucherCreateDraft.getState().clearDraft();
});

describe("voucher prefill", () => {
  it("composes with the profile, which fills only the gaps and never the link's KES", async () => {
    render(<VoucherWizard step="voucher" prefill={LINK} />);

    expect(field("Voucher Name", "Name").value).toBe("Mama Mboga");
    await waitFor(() => expect(saved("voucher-create")?.email).toBe("issuer@example.org"));
    expect(saved("voucher-create")).toMatchObject({
      name: "Mama Mboga",
      description: "Fresh vegetables from Kibera.",
      price: "50",
      unitOfAccount: "KES",
      supply: "1000",
      phone: "+254712345678",
    });
  });

  it("gives way to a view draft: the typing since the link is newer", () => {
    render(<VoucherWizard step="voucher" prefill={LINK} />);
    fireEvent.change(field("Voucher Name", "Name"), { target: { value: "Typed Since" } });

    setViewport(true);

    expect(field("Voucher Name", "Name").value).toBe("Typed Since");
  });

  it("replaces and clears a retry snapshot", () => {
    useVoucherCreateDraft.getState().setDraft({
      name: "Failed Earlier",
      symbol: "FAIL",
      price: "1",
      unitOfAccount: "KES",
      description: "From a failed publish.",
      voucherType: "standard",
      expiryDate: "",
      decimals: "6",
      supply: "10",
      location: { lat: 0, lng: 0, locationName: "Nowhere", country: "KE" },
      tags: [],
      email: "",
      website: "",
      phone: "",
      terms: "",
      markerIcon: null,
      markerColor: null,
      acceptedTerms: true,
    });

    render(<VoucherWizard step="voucher" prefill={LINK} />);

    expect(field("Voucher Name", "Name").value).toBe("Mama Mboga");
    expect(useVoucherCreateDraft.getState().draft).toBeNull();
  });

  it("is ignored on a later step", async () => {
    render(<VoucherWizard step="place" prefill={LINK} />);

    // Only the profile seeds it; the link's name never arrives.
    await waitFor(() => expect(saved("voucher-create")?.name).toBe("Amina Voucher"));
    expect(saved("voucher-create")).not.toMatchObject({ price: "50" });
  });

  it.each(["voucher", "place", "review"] as const)(
    "survives a layout switch untouched on the %s step, after Next dropped the params",
    (step) => {
      const view = render(<VoucherWizard step="voucher" prefill={LINK} />);
      // Next navigates with params only, so every later render has no prefill.
      view.rerender(<VoucherWizard step={step} />);

      setViewport(true);
      view.rerender(<VoucherWizard step="voucher" />);

      expect(field("Voucher Name", "Name").value).toBe("Mama Mboga");
      expect(saved("voucher-create")).toMatchObject({ name: "Mama Mboga", price: "50" });
    },
  );

  it("still clears the bridge when the person edits the form back to the defaults", () => {
    mocks.profile = {};
    render(<VoucherWizard step="voucher" prefill={{ name: "Mama Mboga" }} />);
    expect(saved("voucher-create")).toBeDefined();

    fireEvent.change(field("Voucher Name", "Name"), { target: { value: "" } });

    expect(saved("voucher-create")).toBeUndefined();
  });
});

describe("pool prefill", () => {
  it("falls back from oracle pricing when the unit has no feed on this chain", () => {
    render(
      <PoolWizard
        step="pool"
        prefill={{ name: "Kibera Growers", unitOfAccount: "HOUR", pricing: "oracle" }}
      />,
    );

    expect(saved("pool-create")).toMatchObject({
      name: "Kibera Growers",
      unitOfAccount: "HOUR",
      pricing: "relative",
    });
  });

  it("keeps oracle pricing for any currency", () => {
    render(
      <PoolWizard
        step="pool"
        prefill={{ name: "Kibera Growers", unitOfAccount: "EUR", pricing: "oracle" }}
      />,
    );

    expect(saved("pool-create")).toMatchObject({ unitOfAccount: "EUR", pricing: "oracle" });
  });

  it("drops feesDecoupled without a fee, and seeds the fee recipient to the wallet with one", async () => {
    const view = render(
      <PoolWizard step="pool" prefill={{ name: "No Fee", feesDecoupled: true }} />,
    );
    expect(saved("pool-create")).toMatchObject({ feesDecoupled: false, feeAddress: "" });
    view.unmount();
    clearViewDrafts();

    render(
      <PoolWizard
        step="pool"
        prefill={{ name: "With Fee", feePolicyDefault: "2", feesDecoupled: true }}
      />,
    );
    await waitFor(() =>
      expect(saved("pool-create")).toMatchObject({
        feePolicyDefault: "2",
        feesDecoupled: true,
        feeAddress: getAddress(ALICE),
      }),
    );
  });

  it("keeps the link's unit over the profile's", async () => {
    render(<PoolWizard step="pool" prefill={{ name: "Kibera Growers", unitOfAccount: "KES" }} />);

    await waitFor(() => expect(saved("pool-create")?.email).toBe("issuer@example.org"));
    expect(saved("pool-create")).toMatchObject({ unitOfAccount: "KES" });
  });
});

describe("image import from a link", () => {
  const LINKED: VoucherPrefill = { ...LINK, iconSource: SOURCE };

  it("sends one request across a layout switch, and the arriving view applies its result", async () => {
    const request = deferred<UploadedImage>();
    mocks.importImage.mockReturnValue(request.promise);
    const view = render(<VoucherWizard step="voucher" prefill={LINKED} />);
    await waitFor(() => expect(mocks.importImage).toHaveBeenCalledTimes(1));
    expect(mocks.importImage.mock.calls[0]?.[0]).toMatchObject({
      source: SOURCE,
      purpose: "voucher.icon",
    });

    view.rerender(<VoucherWizard step="place" />);
    setViewport(true);
    await act(async () => request.resolve(imported));

    await waitFor(() => expect(screen.getByTestId("logo").textContent).toBe(IMPORTED));
    expect(mocks.importImage).toHaveBeenCalledTimes(1);
    expect(saved("voucher-create")).toMatchObject({ iconUrl: IMPORTED, iconImport: null });
  });

  it("never lets the profile photo land while an import is pending", async () => {
    mocks.importImage.mockReturnValue(new Promise(() => undefined));
    const view = render(<VoucherWizard step="voucher" prefill={LINKED} />);
    await waitFor(() => expect(saved("voucher-create")?.email).toBe("issuer@example.org"));

    view.rerender(<VoucherWizard step="place" />);

    expect(screen.getByTestId("logo").textContent).toBe("");
  });

  it("keeps an upload the person finished before the import completed", async () => {
    const request = deferred<UploadedImage>();
    mocks.importImage.mockReturnValue(request.promise);
    const view = render(<VoucherWizard step="voucher" prefill={LINKED} />);
    await waitFor(() => expect(mocks.importImage).toHaveBeenCalledTimes(1));
    view.rerender(<VoucherWizard step="place" />);

    fireEvent.click(screen.getByRole("button", { name: "Start upload" }));
    fireEvent.click(screen.getByRole("button", { name: "Finish upload" }));
    await act(async () => request.resolve(imported));

    expect(screen.getByTestId("logo").textContent).toBe(
      "https://storage.test/voucher/mine_400_aaaa.webp",
    );
  });

  it("keeps a removal through a late failure, and shows no import error", async () => {
    const request = deferred<UploadedImage>();
    mocks.importImage.mockReturnValue(request.promise);
    const view = render(<VoucherWizard step="voucher" prefill={LINKED} />);
    await waitFor(() => expect(mocks.importImage).toHaveBeenCalledTimes(1));
    view.rerender(<VoucherWizard step="place" />);

    fireEvent.click(screen.getByRole("button", { name: "Remove logo" }));
    await act(async () => request.reject(new Error("IMPORT_HOST_NOT_ALLOWED")));

    expect(screen.getByTestId("logo").textContent).toBe("");
    expect(screen.queryByText("Couldn't import the image")).toBeNull();
    expect(saved("voucher-create")).toMatchObject({ iconImport: null });
  });

  it("leaves the field empty with a field error when the import fails", async () => {
    mocks.importImage.mockRejectedValue(new Error("IMPORT_HOST_NOT_ALLOWED"));
    const view = render(<VoucherWizard step="voucher" prefill={LINKED} />);
    view.rerender(<VoucherWizard step="place" />);

    expect(await screen.findByText("Couldn't import the image")).toBeTruthy();
    expect(screen.getByTestId("logo").textContent).toBe("");
  });

  it("holds Next while the import is pending, even after the upload field mounts as idle", async () => {
    mocks.importImage.mockReturnValue(new Promise(() => undefined));
    const view = render(<VoucherWizard step="voucher" prefill={LINKED} />);
    view.rerender(<VoucherWizard step="place" />);

    const next = screen.getByRole("button", { name: /Uploading/ }) as HTMLButtonElement;
    expect(next.getAttribute("aria-busy")).toBe("true");
    fireEvent.click(next);
    expect(mocks.navigate).not.toHaveBeenCalledWith(
      expect.objectContaining({ params: { step: "review" } }),
    );
  });

  it("imports a pool logo the same way", async () => {
    mocks.importImage.mockResolvedValue({ ...imported, url: "https://storage.test/pool/x.webp" });
    const view = render(
      <PoolWizard step="pool" prefill={{ name: "Kibera Growers", imageSource: SOURCE }} />,
    );
    view.rerender(<PoolWizard step="place" />);

    await waitFor(() =>
      expect(screen.getByTestId("logo").textContent).toBe("https://storage.test/pool/x.webp"),
    );
    expect(mocks.importImage.mock.calls[0]?.[0]).toMatchObject({ purpose: "pool.image" });
  });
});
