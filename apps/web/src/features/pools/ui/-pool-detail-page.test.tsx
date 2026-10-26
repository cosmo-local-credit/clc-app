vi.mock("#/components/retirement/retirement-control", () => ({
  RetirementControl: () => <button type="button">Request retirement</button>,
}));
vi.mock("#/features/pools/hooks/use-pool-holdings", () => ({
  usePoolHoldings: () => ({
    holdings: [],
    unit: "KES",
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("#/features/wallet/hooks/use-account-balances", () => ({
  useAllAccountTokens: () => ({ tokens: [], isPending: false, isError: false }),
}));
vi.mock("#/features/ownership/hooks/use-asset-owner", () => ({
  useAssetOwner: (_address: string, owner: string | null) => owner,
}));
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { $getRoot, $selectAll, type LexicalEditor } from "lexical";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { UserPool } from "@clc/api/features/pools/client";

const OWNER = "0xDeF0000000000000000000000000000000000456";
const OTHER = "0x9999999999999999999999999999999999999999";
const ADDRESS = "0xAbC0000000000000000000000000000000000123";
vi.mock("#/components/catalogs/add-to-catalog-button", () => ({ AddToCatalogButton: () => null }));

const mocks = vi.hoisted(() => ({
  auth: {
    isAuthenticated: true,
    isLoading: false,
    session: { address: "0xDeF0000000000000000000000000000000000456", chainId: 100 } as
      | { address: string; chainId: number; role?: string }
      | null
      | undefined,
  },
  poolResult: {
    data: undefined as UserPool | undefined,
    isPending: false,
    isError: false,
    privateInfo: undefined as
      | {
          isPending: boolean;
          isError: boolean;
          isFetching: boolean;
          refetch: ReturnType<typeof vi.fn>;
        }
      | undefined,
  },
  updateProfile: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to: _to,
    params: _params,
    search: _search,
    replace: _replace,
    resetScroll: _resetScroll,
    preload: _preload,
    ...props
  }: Record<string, unknown> & { children?: ReactNode }) => (
    <a {...(props as React.ComponentProps<"a">)}>{children}</a>
  ),
  useRouter: () => ({ history: { back: vi.fn() } }),
  useCanGoBack: () => false,
}));

vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => mocks.auth,
}));

vi.mock("#/features/pools/hooks/use-user-pools", () => ({
  useUserPoolByAddress: () => mocks.poolResult,
}));

vi.mock("#/features/pools/hooks/use-pool-vouchers", () => ({
  usePoolVouchersWithStatus: () => ({
    vouchers: [],
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("#/features/pools/hooks/use-pool-voucher-tokens", () => ({
  usePoolVoucherTokens: () => [],
}));

vi.mock("#/features/pools/hooks/use-update-pool-profile", () => ({
  useUpdatePoolProfile: () => ({ mutateAsync: mocks.updateProfile, isPending: false }),
}));

vi.mock("#/hooks/use-deployment", () => ({
  useTokenTags: () => ({
    data: ["Agriculture", "Food"],
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("#/hooks/use-vocabulary", () => ({
  useUnitsOfAccount: () => ({
    data: [],
    isError: false,
    refetch: vi.fn(),
  }),
}));

// Cropping and uploading are covered by the shared field's tests.
vi.mock("#/features/images/use-image-upload", () => ({
  useImageUpload: () => ({
    mutateAsync: vi.fn(),
    reset: () => {},
    isPending: false,
    isError: false,
  }),
}));

vi.mock("./pool-offerings-panel", () => ({
  PoolOfferingsPanel: () => <div data-testid="offerings-panel" />,
}));

// The on-chain steward surface has its own tests; here it only needs to stay out
// of the way of the catalog editor, and its chain reads out of this render.
vi.mock("#/features/pools/hooks/use-pool-quoter", () => ({
  usePoolVoucherRates: () => ({ data: undefined }),
  usePoolQuoterKind: () => ({ kind: "unknown", isPending: false }),
}));

// The controls panel renders for real — it owns the catalog editor now, so a
// stub here would assert against the test's own copy of the gating. Only its
// chain reads are mocked out.
vi.mock("#/features/pools/hooks/use-pool-treasury", () => ({
  usePoolTreasury: () => ({ data: undefined }),
  poolTreasuryQueryKeys: { all: ["pool-treasury"] },
}));

vi.mock("#/features/pools/hooks/use-pool-fee-settings", () => ({
  usePoolFeeSettings: () => ({ data: undefined }),
  poolFeeSettingsQueryKeys: { all: ["pool-fee-settings"] },
}));

vi.mock("#/features/pools/hooks/use-pool-admin", () => ({
  usePoolAdminRelay: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("#/features/ownership/hooks/use-asset-owner-info", async () => {
  const { useAuthStatus } = await import("#/features/auth/hooks/use-auth-status");
  return {
    useAssetOwnerInfo: (_address: string, owner: string | null | undefined) => {
      const auth = useAuthStatus();
      return {
        owner,
        info: undefined,
        pending: false,
        isSafeOwned: false,
        isSafeSigner: false,
        unsupportedOwner: false,
        canManage:
          !!owner &&
          !!auth.session?.address &&
          auth.session.address.toLowerCase() === owner.toLowerCase(),
      };
    },
  };
});
vi.mock("wagmi", () => ({
  useConnection: () => ({ address: OWNER }),
  useClient: () => undefined,
}));

vi.mock("./pool-voucher-sheet", () => ({
  PoolVoucherSheet: () => null,
}));

// The picker geocodes and renders a map; the editor only needs it to hold a place.
vi.mock("#/components/ui/location-picker", () => ({
  LocationPicker: ({
    value,
    onChange,
  }: {
    value?: { locationName: string };
    onChange: (value: undefined) => void;
  }) => (
    <button type="button" onClick={() => onChange(undefined)}>
      {value?.locationName ?? "Choose a location"}
    </button>
  ),
}));

// The shell only defers the chunk; these tests are about the editor inside it.
vi.mock("#/components/ui/markdown-editor", async () => {
  const editor = await import("#/components/ui/markdown-editor-lexical");
  return { MarkdownEditor: editor.MarkdownEditorLexical };
});

import { PoolDetailPage } from "./pool-detail-page";

function pool(overrides: Partial<UserPool> = {}): UserPool {
  return {
    id: "7",
    chainId: 100,
    address: ADDRESS,
    name: "Kilifi Traders",
    symbol: "KLF",
    ownerAddress: OWNER,
    feePpm: null,
    feeAddress: null,
    tokenRegistryAddress: null,
    limiterAddress: null,
    quoterAddress: null,
    quoterType: null,
    feePolicyAddress: null,
    protocolFeeControllerAddress: null,
    feesDecoupled: false,
    decimals: 6,
    description: "Traders around the Kilifi market.",
    unitOfAccount: "KES",
    locationName: "Kilifi, KEN",
    geoLat: -3.63,
    geoLng: 39.85,
    email: "steward@example.org",
    website: "https://example.org",
    phone: "+254700000000",
    imageUrl: "https://cdn.example/pool.webp",
    bannerUrl: null,
    terms: "https://example.org/terms",
    defaultVoucherId: null,
    voucherCount: 0,
    tags: ["Food"],
    ...overrides,
  };
}

const savedProfile = {
  description: "Traders around the Kilifi market.",
  unitOfAccount: "KES",
  email: "steward@example.org",
  website: "https://example.org",
  phone: "+254700000000",
  terms: "https://example.org/terms",
  locationName: "Kilifi, KEN",
  geoLat: -3.63,
  geoLng: 39.85,
  tags: ["Food"],
};

beforeEach(() => {
  mocks.poolResult.data = pool();
  mocks.poolResult.privateInfo = undefined;
  mocks.updateProfile.mockReset();
  mocks.updateProfile.mockResolvedValue(pool({ name: "Kilifi Market Traders" }));
});

afterEach(() => {
  mocks.auth.isAuthenticated = true;
  mocks.auth.isLoading = false;
  mocks.auth.session = { address: OWNER, chainId: 100 };
});

describe("PoolDetailPage pool details editor", () => {
  it("opens a retired pool on Holdings and keeps withdrawals while hiding new pool actions", () => {
    mocks.poolResult.data = pool({ active: false });
    render(<PoolDetailPage poolAddress={ADDRESS} activeTab="offerings" />);
    expect(screen.getByText("Retired pool")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Swap" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Deposit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Receive" })).toBeNull();
    expect(screen.getByRole("button", { name: "Withdraw liquidity" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Withdraw fees" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Holdings" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(screen.getByRole("tabpanel", { name: "Holdings" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Activity" })).toBeTruthy();
  });

  it("keeps guest browsing public while hiding wallet and private pool controls", () => {
    mocks.auth.isAuthenticated = false;
    mocks.auth.session = null;

    render(<PoolDetailPage poolAddress={ADDRESS} activeTab="offerings" />);

    expect(screen.getByTestId("offerings-panel")).toBeTruthy();
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Offerings",
      "Wants",
      "Vouchers",
      "Info",
    ]);
    expect(screen.queryByRole("link", { name: "Swap" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Deposit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Receive" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Holdings" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Credit" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Activity" })).toBeNull();
  });

  it("gates Pool Info for guests and restores the complete panel after sign-in", () => {
    mocks.auth.isAuthenticated = false;
    mocks.auth.session = null;
    const guest = render(<PoolDetailPage poolAddress={ADDRESS} activeTab="info" />);

    expect(screen.getByText("Sign in")).toBeTruthy();
    expect(screen.queryByText("steward@example.org")).toBeNull();
    expect(screen.queryByText("Open in Maps")).toBeNull();
    guest.unmount();

    mocks.auth.isAuthenticated = true;
    mocks.auth.session = { address: OWNER, chainId: 100 };
    render(<PoolDetailPage poolAddress={ADDRESS} activeTab="info" />);
    expect(screen.getByRole("tabpanel", { name: "Info" })).toBeTruthy();
    expect(screen.getByText("steward@example.org")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open in Maps" })).toBeTruthy();
  });

  it("keeps Pool Info unavailable until its protected read succeeds and retries failures", () => {
    const refetch = vi.fn();
    mocks.poolResult.privateInfo = {
      isPending: true,
      isError: false,
      isFetching: true,
      refetch,
    };
    const pending = render(<PoolDetailPage poolAddress={ADDRESS} activeTab="info" />);
    expect(screen.getByText("Loading pool information…")).toBeTruthy();
    expect(screen.queryByText("steward@example.org")).toBeNull();
    pending.unmount();

    mocks.poolResult.privateInfo = {
      isPending: false,
      isError: true,
      isFetching: false,
      refetch,
    };
    render(<PoolDetailPage poolAddress={ADDRESS} activeTab="info" />);
    expect(screen.getByRole("alert").textContent).toContain("Couldn't load pool information.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("offers the editor only to the pool's owner", () => {
    mocks.auth.session = { address: OTHER, chainId: 100 };
    const stranger = render(<PoolDetailPage poolAddress={ADDRESS} activeTab="offerings" />);
    expect(screen.queryByRole("button", { name: "Edit details" })).toBeNull();
    stranger.unmount();

    mocks.auth.session = { address: OWNER.toUpperCase(), chainId: 100 };
    render(<PoolDetailPage poolAddress={ADDRESS} activeTab="offerings" />);
    expect(screen.getByRole("button", { name: "Edit details" })).toBeTruthy();
  });

  it("hides the editor when the catalog does not know the owner", () => {
    mocks.poolResult.data = pool({ ownerAddress: null });
    render(<PoolDetailPage poolAddress={ADDRESS} activeTab="offerings" />);
    expect(screen.queryByRole("button", { name: "Edit details" })).toBeNull();
  });

  it("lets a superadmin edit a pool they do not own", () => {
    mocks.auth.session = { address: OTHER, chainId: 100, role: "SUPERADMIN" };
    render(<PoolDetailPage poolAddress={ADDRESS} activeTab="offerings" />);
    expect(screen.getByRole("button", { name: "Edit details" })).toBeTruthy();
  });

  it("opens the stored record in a sheet and saves the whole profile", async () => {
    render(<PoolDetailPage poolAddress={ADDRESS} activeTab="offerings" />);
    expect(screen.queryByLabelText("Display name")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Edit details" }));
    const dialog = await screen.findByRole("dialog");
    const name = within(dialog).getByLabelText("Display name") as HTMLInputElement;
    expect(name.value).toBe("Kilifi Traders");
    expect((within(dialog).getByLabelText("Pool Description") as HTMLTextAreaElement).value).toBe(
      "Traders around the Kilifi market.",
    );
    expect((within(dialog).getByLabelText("Priced in") as HTMLInputElement).value).toBe(
      "KES - Kenyan Shillings",
    );
    expect((within(dialog).getByLabelText("Terms URL") as HTMLInputElement).value).toBe(
      "https://example.org/terms",
    );
    expect(within(dialog).getByText("Kilifi, KEN")).toBeTruthy();

    fireEvent.change(name, { target: { value: "Kilifi Market Traders" } });
    fireEvent.change(within(dialog).getByLabelText("Contact Email"), { target: { value: "" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(mocks.updateProfile).toHaveBeenCalledWith({
        ...savedProfile,
        displayName: "Kilifi Market Traders",
        email: "",
        clearContactFields: ["email"],
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  // The label is an override, and an ordinary metadata save must not create one.
  it("leaves an untouched display name and logo out of the write", async () => {
    render(<PoolDetailPage poolAddress={ADDRESS} activeTab="offerings" />);
    fireEvent.click(screen.getByRole("button", { name: "Edit details" }));
    const dialog = await screen.findByRole("dialog");

    fireEvent.change(within(dialog).getByLabelText("Pool Description"), {
      target: { value: "Traders and farmers around the Kilifi market." },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mocks.updateProfile).toHaveBeenCalledTimes(1));
    const written = mocks.updateProfile.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(written.description).toBe("Traders and farmers around the Kilifi market.");
    expect("displayName" in written).toBe(false);
    expect("imageUrl" in written).toBe(false);
  });

  it("clears an override when the owner restores the immutable contract name", async () => {
    mocks.poolResult.data = pool({
      name: "Kilifi Traders",
      contractName: "Kilifi Community Pool",
    });
    render(<PoolDetailPage poolAddress={ADDRESS} activeTab="offerings" />);
    fireEvent.click(screen.getByRole("button", { name: "Edit details" }));
    const dialog = await screen.findByRole("dialog");

    fireEvent.change(within(dialog).getByLabelText("Display name"), {
      target: { value: "Kilifi Community Pool" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mocks.updateProfile).toHaveBeenCalledTimes(1));
    expect(mocks.updateProfile.mock.calls[0]?.[0]).toMatchObject({ displayName: "" });
  });

  it("does not write a display name shorter than a pool name may be", async () => {
    render(<PoolDetailPage poolAddress={ADDRESS} activeTab="offerings" />);
    fireEvent.click(screen.getByRole("button", { name: "Edit details" }));
    const dialog = await screen.findByRole("dialog");

    fireEvent.change(within(dialog).getByLabelText("Display name"), { target: { value: "Ki" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

    expect((await within(dialog).findByRole("alert")).textContent).toBe(
      "Pool name must be at least 3 characters",
    );
    expect(mocks.updateProfile).not.toHaveBeenCalled();
  });

  it("opens written terms formatted in the editor, with no syntax hint to read", async () => {
    mocks.poolResult.data = pool({ terms: "## House rules\n\nSettle every **Friday**." });
    render(<PoolDetailPage poolAddress={ADDRESS} activeTab="offerings" />);
    fireEvent.click(screen.getByRole("button", { name: "Edit details" }));
    const dialog = await screen.findByRole("dialog");

    const terms = await within(dialog).findByRole("textbox", {
      name: "Shown to anyone using this pool",
    });
    expect(terms.querySelector("h2")?.textContent).toBe("House rules");
    expect(terms.querySelector("strong")?.textContent).toBe("Friday");
    expect(within(dialog).queryByRole("button", { name: "Preview" })).toBeNull();
    expect(within(dialog).queryByText(/Markdown: \*\*bold\*\*/)).toBeNull();
  });

  it("saves terms formatted from the toolbar as markdown", async () => {
    render(<PoolDetailPage poolAddress={ADDRESS} activeTab="offerings" />);
    fireEvent.click(screen.getByRole("button", { name: "Edit details" }));
    const dialog = await screen.findByRole("dialog");

    // Flipping the switch discards the link: a URL is not a body of terms.
    fireEvent.click(within(dialog).getByRole("switch", { name: "Write my own" }));
    const terms = (await within(dialog).findByRole("textbox", {
      name: "Shown to anyone using this pool",
    })) as HTMLElement & { __lexicalEditor: LexicalEditor };
    expect(terms.textContent).toBe("");

    await act(async () => {
      terms.__lexicalEditor.update(() => {
        $getRoot().selectEnd().insertText("Settle every Friday");
      });
    });
    await act(async () => {
      terms.__lexicalEditor.update(() => {
        $selectAll();
      });
    });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Bulleted list" }));
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mocks.updateProfile).toHaveBeenCalledTimes(1));
    expect(mocks.updateProfile.mock.calls[0]?.[0]).toMatchObject({
      terms: "- Settle every Friday",
    });
  });

  it("shows the currency it was switched to", async () => {
    render(<PoolDetailPage poolAddress={ADDRESS} activeTab="offerings" />);
    fireEvent.click(screen.getByRole("button", { name: "Edit details" }));
    const dialog = await screen.findByRole("dialog");
    const currency = within(dialog).getByLabelText("Priced in") as HTMLInputElement;

    fireEvent.focus(currency);
    fireEvent.change(currency, { target: { value: "Tanzan" } });
    const option = screen.getByRole("option", { name: "TZS - Tanzanian Shilling" });
    fireEvent.pointerDown(option, { pointerType: "touch" });
    fireEvent.click(option);

    expect(currency.value).toBe("TZS - Tanzanian Shilling");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(mocks.updateProfile).toHaveBeenCalledWith({ ...savedProfile, unitOfAccount: "TZS" }),
    );
  });

  it("keeps an existing oracle pool's unit of account read-only", async () => {
    mocks.poolResult.data = pool({ quoterType: "oracle", unitOfAccount: "KES" });
    render(<PoolDetailPage poolAddress={ADDRESS} activeTab="offerings" />);
    fireEvent.click(screen.getByRole("button", { name: "Edit details" }));
    const dialog = await screen.findByRole("dialog");

    expect((within(dialog).getByLabelText("Priced in") as HTMLInputElement).disabled).toBe(true);
    expect(
      within(dialog).getByText("The unit of account is fixed by this pool's deployed oracle."),
    ).toBeTruthy();
  });
});

describe("PoolDetailPage on-chain management", () => {
  it("offers every pool viewer a receive action", () => {
    mocks.auth.session = { address: OTHER, chainId: 100 };
    render(<PoolDetailPage poolAddress={ADDRESS} activeTab="offerings" />);

    expect(screen.getByRole("button", { name: "Receive" })).toBeTruthy();
  });

  it("offers the steward controls to the pool's owner", () => {
    render(<PoolDetailPage poolAddress={ADDRESS} activeTab="vouchers" />);
    expect(screen.getByRole("button", { name: "Withdraw liquidity" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Approve voucher" })).toBeTruthy();
  });

  it("withholds them from a superadmin who does not own the pool", () => {
    // Every call behind these is `onlyOwner`, so a superadmin pressing them
    // would only be signing a revert. They keep the catalog editor.
    mocks.auth.session = { address: OTHER, chainId: 100, role: "SUPERADMIN" };
    render(<PoolDetailPage poolAddress={ADDRESS} activeTab="vouchers" />);
    expect(screen.queryByRole("button", { name: "Withdraw liquidity" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Approve voucher" })).toBeNull();
    expect(screen.getByRole("button", { name: "Edit details" })).toBeTruthy();
  });

  it("withholds them from anyone else", () => {
    mocks.auth.session = { address: OTHER, chainId: 100 };
    render(<PoolDetailPage poolAddress={ADDRESS} activeTab="vouchers" />);
    expect(screen.queryByRole("button", { name: "Withdraw liquidity" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Approve voucher" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit details" })).toBeNull();
  });
});
