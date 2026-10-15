import type { ProfileDefaults } from "@clc/core/features/signup/prefill";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { $convertFromMarkdownString } from "@lexical/markdown";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { LexicalEditor } from "lexical";
import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const {
  deployMutateAsync,
  exitVoucherCreateHistoryMock,
  getNameAvailability,
  getTakenSymbols,
  navigateMock,
  profile,
} = vi.hoisted(() => ({
  deployMutateAsync: vi.fn(),
  exitVoucherCreateHistoryMock: vi.fn(),
  getNameAvailability: vi.fn(),
  getTakenSymbols: vi.fn(),
  navigateMock: vi.fn(),
  // Mutable so one test can hand the form a profile that also carries a saved
  // location and currency, which the rest deliberately leave at their defaults.
  profile: { current: {} as ProfileDefaults },
}));

const DEFAULT_PROFILE: ProfileDefaults = {
  email: "issuer@example.org",
  phone: "+254712345678",
  website: "https://issuer.example",
  bio: "Fresh produce from Kilifi.",
  avatarUrl: "https://cdn.test/profile/avatar.webp",
};

const quotaMock = vi.hoisted(() => ({
  data: {
    vouchers: { used: 0, limit: 1, canCreate: true, unlimited: false },
    catalogs: { used: 0, limit: 1, canCreate: true, unlimited: false },
    offers: { used: 0, limit: 3, canCreate: true, unlimited: false },
    pools: { used: 0, limit: 10, canCreate: true, unlimited: false },
  },
  isPending: false,
  isError: false,
  refetch: vi.fn(),
}));
vi.mock("#/hooks/use-resource-usage", () => ({ useResourceUsage: () => quotaMock }));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  useCanGoBack: () => false,
  useNavigate: () => navigateMock,
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
  useConnection: () => ({ address: "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d" }),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }));

vi.mock("#/lib/api/symbols", () => ({ symbolsClient: { getTakenSymbols } }));
vi.mock("#/lib/api/names", () => ({ namesClient: { getNameAvailability } }));

vi.mock("#/lib/navigation/voucher-create-history", () => ({
  beginVoucherCreateHistory: vi.fn(),
  exitVoucherCreateHistory: exitVoucherCreateHistoryMock,
}));

vi.mock("#/components/ui/location-picker", () => ({
  LocationPicker: ({
    value,
    onChange,
    markerStyle,
  }: {
    value?: { locationName: string };
    onChange: (value: { locationName: string; country: string; lat: number; lng: number }) => void;
    markerStyle?: { icon: string; color: string };
  }) => (
    <button
      type="button"
      data-marker-icon={markerStyle?.icon}
      data-marker-color={markerStyle?.color}
      onClick={() =>
        onChange({
          locationName: "Kilifi, Kenya",
          country: "KE",
          lat: -3.5107,
          lng: 39.9093,
        })
      }
    >
      {value?.locationName ?? "Choose Kilifi, Kenya"}
    </button>
  ),
}));

vi.mock("#/features/vouchers/hooks/use-voucher-deployment", () => ({
  useDeployVoucher: () => ({
    error: null,
    isPending: false,
    mutateAsync: deployMutateAsync,
  }),
}));

vi.mock("#/features/auth/hooks/use-profile", () => ({
  useAuthProfile: () => ({ data: profile.current }),
}));

vi.mock("#/hooks/use-deployment", () => ({
  useTokenTags: () => ({
    data: ["Agriculture", "Food production"],
    isError: false,
    isPending: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("#/lib/api/storage", () => ({ isStorageConfigured: true }));

// The shell only defers the chunk; these tests are about the editor inside it.
vi.mock("#/components/ui/markdown-editor", async () => {
  const editor = await import("#/components/ui/markdown-editor-lexical");
  return { MarkdownEditor: editor.MarkdownEditorLexical };
});

// Cropping and uploading are covered by the shared field's tests. This keeps
// this suite on form integration: stored URLs must survive the steps and reach
// the deploy request.
vi.mock("#/components/ui/image-upload-field", () => ({
  ImageUploadField: ({
    label,
    purpose,
    value,
    onChange,
    onBusyChange,
  }: {
    label: string;
    purpose: "voucher.icon";
    value: string | null;
    onChange: (url: string | null) => void;
    onBusyChange?: (busy: boolean) => void;
  }) => (
    <div>
      <span>{label}</span>
      <span data-testid={`${purpose}-value`}>{value ?? ""}</span>
      <button
        type="button"
        onClick={() => onChange(`https://cdn.test/${purpose.replace(".", "/")}.webp`)}
      >
        {`Upload ${label}`}
      </button>
      <button type="button" onClick={() => onBusyChange?.(true)}>
        {`Start ${label} upload`}
      </button>
      <button type="button" onClick={() => onBusyChange?.(false)}>
        {`Finish ${label} upload`}
      </button>
    </div>
  ),
}));

import { MARKDOWN_TRANSFORMERS } from "#/components/ui/markdown-editor-lexical";
import { BackendApiError } from "@clc/api/client/errors";
import { toast } from "sonner";

import { CreateVoucherFlow } from "./create-voucher-flow";
import { useVoucherCreateDraft } from "#/features/vouchers/state/voucher-create-draft";

/** The flow reads symbol occupancy through the query cache, so it needs a client. */
function renderFlow(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
  return { ...view, queryClient };
}

/** Replaces what the terms editor holds, as if the author had formatted it. */
async function writeTerms(label: string, markdown: string) {
  const root = screen.getByRole("textbox", { name: label }) as HTMLElement & {
    __lexicalEditor: LexicalEditor;
  };
  await act(async () => {
    root.__lexicalEditor.update(() => {
      $convertFromMarkdownString(markdown, MARKDOWN_TRANSFORMERS);
    });
  });
}

beforeEach(() => {
  quotaMock.data.vouchers.canCreate = true;
  quotaMock.isError = false;
  profile.current = { ...DEFAULT_PROFILE };
  getTakenSymbols.mockImplementation(async (kind: string, prefix: string) => ({
    kind,
    prefix,
    taken: [],
  }));
  getNameAvailability.mockImplementation(async (kind: string, name: string) => ({
    kind,
    name,
    available: true,
  }));
});

afterEach(() => {
  vi.clearAllMocks();
  useVoucherCreateDraft.getState().clearDraft();
});

describe("CreateVoucherFlow", () => {
  it("keeps technical pricing and token settings in Advanced", () => {
    renderFlow(<CreateVoucherFlow step="voucher" />);

    expect(screen.getByRole("heading", { level: 1, name: "Create voucher" })).toBeTruthy();

    const guidance = screen.getByText(/A voucher acts like a gift card/);
    expect(guidance.tagName).toBe("P");
    expect(guidance.classList).toContain("leading-snug");
    const guidanceTitle = screen.getByText("What's a voucher?");
    expect(guidanceTitle.classList).toContain("bg-primary/[0.08]");
    expect(guidanceTitle.classList).toContain("text-primary");
    expect(guidanceTitle.closest("aside")?.classList).toContain("bg-card");

    expect(screen.queryByLabelText("Voucher Type")).toBeNull();
    expect(screen.queryByLabelText("Decimals")).toBeNull();
    expect((screen.getByLabelText("Create vouchers") as HTMLInputElement).value).toBe("1000");
    expect(screen.getByText("Value: 1000 KES of offerings")).toBeTruthy();
    expect(screen.queryByLabelText("Voucher Value")).toBeNull();
    expect(screen.queryByLabelText("Currency")).toBeNull();
    expect(screen.queryByLabelText("Unit of Account")).toBeNull();
    expect(document.querySelector('[data-slot="voucher-price-unit"]')?.textContent).toBe("KES");

    const advancedSummary = screen.getByText("Advanced");
    expect(advancedSummary.tagName).toBe("SUMMARY");
    const advancedDetails = advancedSummary.closest("details") as HTMLDetailsElement;
    expect(advancedDetails.open).toBe(false);
    expect(advancedDetails.contains(screen.getByLabelText("Price"))).toBe(true);
    expect(advancedDetails.contains(screen.getByLabelText("Priced in"))).toBe(true);

    fireEvent.click(advancedSummary);
    expect(advancedDetails.open).toBe(true);
    expect(advancedDetails.contains(screen.getByLabelText("Voucher Symbol"))).toBe(true);
    const currency = screen.getByLabelText("Priced in");
    const price = screen.getByLabelText("Price");
    const pricingRow = document.querySelector('[data-slot="voucher-pricing-row"]');
    expect(pricingRow?.contains(price)).toBe(true);
    expect(pricingRow?.contains(currency)).toBe(true);
    expect(document.querySelector('[data-slot="voucher-price-unit"]')?.textContent).toBe("KES");
  });

  it("previews the voucher price in its selected currency or measure", () => {
    renderFlow(<CreateVoucherFlow step="voucher" />);
    fireEvent.click(screen.getByText("Advanced"));

    expect(screen.getByText("1 voucher = 1 KES")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Voucher Name"), {
      target: { value: "Kilifi Voucher" },
    });
    fireEvent.change(screen.getByLabelText("Price"), { target: { value: "10" } });

    expect(screen.getByText("1 Kilifi Voucher = 10 KES")).toBeTruthy();
  });

  it("searches the full currency list using code or currency name", async () => {
    renderFlow(<CreateVoucherFlow step="voucher" />);
    fireEvent.click(screen.getByText("Advanced"));

    const currency = screen.getByRole("combobox", { name: "Priced in" });
    fireEvent.click(currency);
    // Found by text, then checked for its role: a role query computes the
    // accessible name of every one of the ~160 currencies, which under a loaded
    // full-suite run took this test past its timeout.
    expect(screen.getByText("KES - Kenyan Shillings").closest('[role="option"]')).toBeTruthy();
    expect(screen.queryByText(/KES —/)).toBeNull();

    fireEvent.change(currency, { target: { value: "Tanzanian" } });
    const tanzanianShilling = (await screen.findByText("TZS - Tanzanian Shilling")).closest(
      '[role="option"]',
    );
    if (!tanzanianShilling) throw new Error("TZS is not offered as an option");
    fireEvent.pointerDown(tanzanianShilling, { pointerType: "touch" });
    fireEvent.click(tanzanianShilling);

    await waitFor(() =>
      expect((currency as HTMLInputElement).value).toBe("TZS - Tanzanian Shilling"),
    );
    expect(screen.getByText("1 voucher = 1 TZS")).toBeTruthy();
  });

  it("prefills the calling code from the profile phone even when its country differs", async () => {
    profile.current = { ...DEFAULT_PROFILE, phone: "+38761123456", country: "KE" };
    renderFlow(<CreateVoucherFlow step="place" />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Country: BA" }).textContent).toContain("+387");
      expect(
        (screen.getByLabelText("Contact Phone") as HTMLInputElement).value.replace(/\D/g, ""),
      ).toBe("61123456");
    });
  });

  it("keeps tags compact and prefills contact details from the profile", async () => {
    renderFlow(<CreateVoucherFlow step="place" />);

    await waitFor(() => {
      expect((screen.getByLabelText("Contact Email") as HTMLInputElement).value).toBe(
        "issuer@example.org",
      );
      expect((screen.getByLabelText("Contact Phone") as HTMLInputElement).value).toBe("712 345678");
    });
    expect((screen.getByLabelText("Contact Website") as HTMLInputElement).value).toBe(
      "https://issuer.example",
    );
    expect(screen.getByRole("button", { name: "Upload Logo" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Upload Cover photo" })).toBeNull();
    expect(screen.queryByText(/Public — voucher holders/)).toBeNull();

    const tagSearch = screen.getByRole("combobox", { name: "Search voucher tags" });
    expect(screen.queryByRole("option", { name: "Agriculture" })).toBeNull();

    fireEvent.click(tagSearch);
    fireEvent.click(await screen.findByRole("option", { name: "Agriculture" }));

    expect(screen.getByRole("button", { name: "Remove Agriculture" })).toBeTruthy();

    fireEvent.pointerDown(screen.getByLabelText("Contact Email"));
    expect(screen.queryByRole("option", { name: "Agriculture" })).toBeNull();
  });

  it("seeds the location, icon and unit of account from the saved profile", async () => {
    profile.current = {
      ...DEFAULT_PROFILE,
      preferredCurrency: "TZS",
      country: "KE",
      locationName: "Kilifi, Kenya",
      geoLat: -3.5107,
      geoLng: 39.9093,
    };
    const view = renderFlow(<CreateVoucherFlow step="place" />);

    await waitFor(() =>
      expect(screen.getByTestId("voucher.icon-value").textContent).toBe(
        "https://cdn.test/profile/avatar.webp",
      ),
    );
    expect(screen.getByRole("button", { name: "Kilifi, Kenya" })).toBeTruthy();

    view.rerender(<CreateVoucherFlow step="voucher" />);
    expect((screen.getByLabelText("Voucher Description") as HTMLTextAreaElement).value).toBe(
      "Fresh produce from Kilifi.",
    );
    fireEvent.click(screen.getByText("Advanced"));
    expect((screen.getByLabelText("Priced in") as HTMLInputElement).value).toBe(
      "TZS - Tanzanian Shilling",
    );
  });

  it("starts a new voucher with the profile name", async () => {
    profile.current = { ...DEFAULT_PROFILE, name: "Amina's Bakery" };
    renderFlow(<CreateVoucherFlow step="voucher" />);

    await waitFor(() =>
      expect((screen.getByLabelText("Voucher Name") as HTMLInputElement).value).toBe(
        "Amina's Bakery Voucher",
      ),
    );
  });

  it("collects an optional voucher terms URL", () => {
    renderFlow(<CreateVoucherFlow step="place" />);

    const terms = screen.getByLabelText("Terms URL");
    expect(terms.getAttribute("type")).toBe("url");
    expect(screen.queryByLabelText("Shown to anyone holding this voucher")).toBeNull();
  });

  it("lets the issuer write their own terms as Markdown instead of linking", async () => {
    deployMutateAsync.mockResolvedValue({ trackingId: "tracking-1" });
    const view = renderFlow(<CreateVoucherFlow step="voucher" />);
    fireEvent.click(screen.getByText("Advanced"));
    fireEvent.change(screen.getByLabelText("Voucher Name"), { target: { value: "Kilifi" } });
    fireEvent.change(screen.getByLabelText("Voucher Symbol"), { target: { value: "KHV" } });
    fireEvent.change(screen.getByLabelText("Voucher Description"), {
      target: { value: "Fresh food." },
    });
    fireEvent.change(screen.getByLabelText("Create vouchers"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith(
        expect.objectContaining({ params: { step: "place" } }),
      ),
    );
    view.rerender(<CreateVoucherFlow step="place" />);

    fireEvent.change(screen.getByLabelText("Terms URL"), {
      target: { value: "https://kilifi.example/terms" },
    });
    fireEvent.click(screen.getByRole("switch", { name: "Write my own" }));

    // Flipping the switch discards the link: a URL is not a body of terms.
    const editor = await screen.findByRole("textbox", {
      name: "Shown to anyone holding this voucher",
    });
    expect(editor.textContent).toBe("");
    expect(screen.queryByLabelText("Terms URL")).toBeNull();

    await writeTerms(
      "Shown to anyone holding this voucher",
      "# House rules\n\nRedeemable on **market days** only.",
    );
    // Formatted where it is written: no syntax to read, so nothing to preview.
    expect(editor.querySelector("h1")?.textContent).toBe("House rules");
    expect(editor.querySelector("strong")?.textContent).toBe("market days");
    expect(screen.queryByRole("button", { name: "Preview" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Choose Kilifi, Kenya" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith(
        expect.objectContaining({ params: { step: "review" } }),
      ),
    );
    view.rerender(<CreateVoucherFlow step="review" />);
    expect(screen.getByText("Written below")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "House rules" })).toBeTruthy();

    fireEvent.click(screen.getByRole("checkbox", { name: "Accept Terms and Conditions" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm & Publish" }));
    await waitFor(() => expect(deployMutateAsync).toHaveBeenCalled());
    expect(deployMutateAsync.mock.calls[0]?.[0]).toMatchObject({
      terms: "# House rules\n\nRedeemable on **market days** only.",
    });
  });

  it("sends the issuer back to the name when the backend reports it was taken", async () => {
    deployMutateAsync.mockRejectedValue(
      new BackendApiError(409, "a voucher with this name already exists", "E16"),
    );
    const view = renderFlow(<CreateVoucherFlow step="voucher" />);
    fireEvent.click(screen.getByText("Advanced"));
    fireEvent.change(screen.getByLabelText("Voucher Name"), { target: { value: "Kilifi" } });
    fireEvent.change(screen.getByLabelText("Voucher Symbol"), { target: { value: "KHV" } });
    fireEvent.change(screen.getByLabelText("Voucher Description"), {
      target: { value: "Fresh food." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith(
        expect.objectContaining({ params: { step: "place" } }),
      ),
    );
    view.rerender(<CreateVoucherFlow step="place" />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Kilifi, Kenya" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith(
        expect.objectContaining({ params: { step: "review" } }),
      ),
    );
    view.rerender(<CreateVoucherFlow step="review" />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Accept Terms and Conditions" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm & Publish" }));

    await waitFor(() => expect(deployMutateAsync).toHaveBeenCalled());
    // Back to the field that is wrong, not a raw error code under a review
    // screen the issuer cannot act on.
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith({
        to: "/vouchers/create/$step",
        params: { step: "voucher" },
      }),
    );
    expect(toast.error).toHaveBeenCalledWith(
      "That voucher name was taken while you were filling this in.",
    );
    expect(exitVoucherCreateHistoryMock).not.toHaveBeenCalled();
  });

  it("does not advance while a voucher image is still uploading", () => {
    renderFlow(<CreateVoucherFlow step="place" />);

    fireEvent.click(screen.getByRole("button", { name: "Start Logo upload" }));
    expect((screen.getByRole("button", { name: "Uploading…" }) as HTMLButtonElement).disabled).toBe(
      true,
    );

    fireEvent.click(screen.getByRole("button", { name: "Finish Logo upload" }));
    expect((screen.getByRole("button", { name: "Next" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("requires the linked platform terms before publishing", () => {
    renderFlow(<CreateVoucherFlow step="review" />);

    const terms = screen.getByRole("checkbox", { name: "Accept Terms and Conditions" });
    const publish = screen.getByRole("button", { name: "Confirm & Publish" });

    expect(screen.getByRole("link", { name: "Terms and Conditions" }).getAttribute("href")).toBe(
      "https://docs.cosmolocal.credit/governance/terms",
    );
    expect(screen.queryByText("PATH License")).toBeNull();
    expect((publish as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(terms);
    expect((publish as HTMLButtonElement).disabled).toBe(false);
  });

  it("keeps form state across all three routes and deploys only after confirmation", async () => {
    deployMutateAsync.mockResolvedValue({ trackingId: "tracking-1" });
    const view = renderFlow(<CreateVoucherFlow step="voucher" />);
    fireEvent.click(screen.getByText("Advanced"));

    fireEvent.change(screen.getByLabelText("Voucher Name"), {
      target: { value: "Kilifi Harvest" },
    });
    fireEvent.change(screen.getByLabelText("Voucher Symbol"), { target: { value: "khv" } });
    fireEvent.change(screen.getByLabelText("Voucher Description"), {
      target: { value: "Fresh food from Kilifi producers." },
    });
    fireEvent.change(screen.getByLabelText("Create vouchers"), { target: { value: "10000" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith({
        to: "/vouchers/create/$step",
        params: { step: "place" },
      }),
    );

    view.rerender(<CreateVoucherFlow step="place" />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Kilifi, Kenya" }));
    fireEvent.change(screen.getByLabelText("Contact Website"), {
      target: { value: "https://kilifi.example" },
    });
    fireEvent.change(screen.getByLabelText("Terms URL"), {
      target: { value: "https://kilifi.example/terms" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Upload Logo" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Search voucher tags" }));
    fireEvent.click(await screen.findByRole("option", { name: "Agriculture" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith({
        to: "/vouchers/create/$step",
        params: { step: "review" },
      }),
    );

    view.rerender(<CreateVoucherFlow step="review" />);
    expect(screen.getByText("Kilifi Harvest")).toBeTruthy();
    expect(screen.getByText("KHV")).toBeTruthy();
    expect(screen.getByText("Agriculture")).toBeTruthy();
    expect(screen.getByText("https://kilifi.example/terms")).toBeTruthy();

    const publish = screen.getByRole("button", { name: "Confirm & Publish" });
    fireEvent.click(screen.getByRole("checkbox", { name: "Accept Terms and Conditions" }));
    expect((publish as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(publish);

    await waitFor(() =>
      expect(deployMutateAsync).toHaveBeenCalledWith({
        name: "Kilifi Harvest",
        symbol: "KHV",
        decimals: "6",
        owner: "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d",
        description: "Fresh food from Kilifi producers.",
        voucherUoa: "KES",
        voucherValue: 1,
        locationName: "Kilifi, Kenya",
        geoLat: -3.5107,
        geoLng: 39.9093,
        tags: ["Agriculture"],
        email: "issuer@example.org",
        website: "https://kilifi.example",
        terms: "https://kilifi.example/terms",
        phone: "+254712345678",
        iconUrl: "https://cdn.test/voucher/icon.webp",
      }),
    );
    expect(exitVoucherCreateHistoryMock).toHaveBeenCalledWith({
      history: expect.any(Object),
      destination: "/vouchers/create/receipt?trackingId=tracking-1&mintAmount=10000",
    });
  });

  it("lets the issuer choose the map pin, and sends it only when chosen", async () => {
    deployMutateAsync.mockResolvedValue({ trackingId: "tracking-1" });
    useVoucherCreateDraft.getState().setDraft({
      name: "Kilifi Harvest",
      symbol: "KHV",
      price: "1",
      unitOfAccount: "KES",
      description: "Fresh food from Kilifi producers.",
      voucherType: "standard",
      expiryDate: "",
      decimals: "6",
      supply: "1000",
      location: { locationName: "Kilifi, Kenya", country: "KE", lat: -3.5107, lng: 39.9093 },
      tags: [],
      email: "",
      website: "",
      phone: "",
      terms: "",
      iconUrl: "",
      markerIcon: null,
      markerColor: null,
      acceptedTerms: true,
    });
    const view = renderFlow(<CreateVoucherFlow step="place" />);

    const icons = screen.getByRole("radiogroup", { name: "Pin icon" });
    const colours = screen.getByRole("radiogroup", { name: "Pin colour" });
    // Nothing is chosen until the issuer picks: the pin follows the offerings.
    expect(within(icons).queryByRole("radio", { checked: true })).toBeNull();
    expect(screen.queryByRole("button", { name: "Use default" })).toBeNull();
    expect(within(icons).getAllByRole("radio")).toHaveLength(8);
    expect(
      screen.getByRole("button", { name: "Kilifi, Kenya" }).getAttribute("data-marker-icon"),
    ).toBe("coupon");

    fireEvent.click(within(icons).getByRole("radio", { name: "Education" }));
    fireEvent.click(within(colours).getByRole("radio", { name: "Pink" }));
    expect(
      within(icons).getByRole("radio", { name: "Education" }).getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: "Kilifi, Kenya" }).getAttribute("data-marker-icon"),
    ).toBe("education");
    expect(
      screen.getByRole("button", { name: "Kilifi, Kenya" }).getAttribute("data-marker-color"),
    ).toBe("pink");

    view.rerender(<CreateVoucherFlow step="review" />);
    expect(screen.getByText("Education, Pink")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm & Publish" }));
    await waitFor(() =>
      expect(deployMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ markerIcon: "education", markerColor: "pink" }),
      ),
    );

    view.rerender(<CreateVoucherFlow step="place" />);
    fireEvent.click(screen.getByRole("button", { name: "Use default" }));
    expect(
      screen.getByRole("button", { name: "Kilifi, Kenya" }).getAttribute("data-marker-icon"),
    ).toBe("coupon");
    expect(
      screen.getByRole("button", { name: "Kilifi, Kenya" }).getAttribute("data-marker-color"),
    ).toBe("orange");
    view.rerender(<CreateVoucherFlow step="review" />);
    fireEvent.click(screen.getByRole("button", { name: "Confirm & Publish" }));
    await waitFor(() => expect(deployMutateAsync).toHaveBeenCalledTimes(2));
    const payload = deployMutateAsync.mock.calls[1]?.[0] as Record<string, unknown>;
    expect("markerIcon" in payload).toBe(false);
    expect("markerColor" in payload).toBe(false);
  });

  it("always sends the standard six-decimal token defaults", async () => {
    renderFlow(<CreateVoucherFlow step="voucher" />);
    fireEvent.change(screen.getByLabelText("Voucher Name"), { target: { value: "Kilifi" } });
    fireEvent.click(screen.getByText("Advanced"));
    fireEvent.change(screen.getByLabelText("Voucher Symbol"), { target: { value: "KHV" } });
    fireEvent.change(screen.getByLabelText("Voucher Description"), {
      target: { value: "Fresh food." },
    });
    expect(screen.queryByLabelText("Voucher Type")).toBeNull();
    expect(screen.queryByLabelText("Expiration Date")).toBeNull();
    expect(screen.queryByLabelText("Decimals")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith({
        to: "/vouchers/create/$step",
        params: { step: "place" },
      }),
    );
  });

  it("warns while typing that a voucher name is already taken, and refuses Next", async () => {
    getNameAvailability.mockImplementation(async (kind: string, name: string) => ({
      kind,
      name,
      available: name.toLowerCase() !== "kilifi market",
    }));
    renderFlow(<CreateVoucherFlow step="voucher" />);

    fireEvent.change(screen.getByLabelText("Voucher Name"), {
      target: { value: "Kilifi Market" },
    });
    expect(await screen.findByText("That voucher name is already taken")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(getNameAvailability).toHaveBeenCalled());
    expect(navigateMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ params: { step: "place" } }),
    );

    // The name the backend was asked about is normalized, so padding and casing
    // cannot walk past a label that is taken.
    expect(getNameAvailability).toHaveBeenCalledWith("voucher", "Kilifi Market", expect.anything());
  });

  it("treats an unreachable availability lookup as no answer rather than a block", async () => {
    getNameAvailability.mockRejectedValue(new Error("offline"));
    renderFlow(<CreateVoucherFlow step="voucher" />);

    fireEvent.change(screen.getByLabelText("Voucher Name"), { target: { value: "Kilifi" } });
    fireEvent.click(screen.getByText("Advanced"));
    fireEvent.change(screen.getByLabelText("Voucher Symbol"), { target: { value: "KHV" } });
    fireEvent.change(screen.getByLabelText("Voucher Description"), {
      target: { value: "Fresh food." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith({
        to: "/vouchers/create/$step",
        params: { step: "place" },
      }),
    );
    expect(screen.queryByText("That voucher name is already taken")).toBeNull();
  });

  it("does not advance while required voucher fields are empty", async () => {
    renderFlow(<CreateVoucherFlow step="voucher" />);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText("Voucher name must be at least 3 characters")).toBeTruthy();
    expect(navigateMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ params: { step: "place" } }),
    );
  });

  it("asks for the opening supply on the first step and previews its value", async () => {
    renderFlow(<CreateVoucherFlow step="voucher" />);
    fireEvent.change(screen.getByLabelText("Voucher Name"), { target: { value: "Kilifi" } });
    fireEvent.click(screen.getByText("Advanced"));
    fireEvent.change(screen.getByLabelText("Voucher Symbol"), { target: { value: "KHV" } });
    fireEvent.change(screen.getByLabelText("Voucher Description"), {
      target: { value: "Fresh food." },
    });
    fireEvent.change(screen.getByLabelText("Price"), { target: { value: "2.5" } });
    fireEvent.change(screen.getByLabelText("Create vouchers"), { target: { value: "0" } });

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Supply must be greater than zero")).toBeTruthy();
    expect(navigateMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ params: { step: "place" } }),
    );

    fireEvent.change(screen.getByLabelText("Create vouchers"), { target: { value: "12" } });
    expect(screen.getByText("Value: 30 KES of offerings")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith({
        to: "/vouchers/create/$step",
        params: { step: "place" },
      }),
    );
  });

  describe("symbol suggestion", () => {
    const symbolInput = () => {
      if (!screen.queryByLabelText("Voucher Symbol")) fireEvent.click(screen.getByText("Advanced"));
      return screen.getByLabelText("Voucher Symbol") as HTMLInputElement;
    };

    it("fills the symbol from the name once the name blurs", async () => {
      renderFlow(<CreateVoucherFlow step="voucher" />);
      fireEvent.click(screen.getByText("Advanced"));

      const name = screen.getByLabelText("Voucher Name");
      fireEvent.change(name, { target: { value: "Kivukoni School Voucher" } });
      fireEvent.blur(name);

      await waitFor(() => expect(symbolInput().value).toBe("KVKS"));
      expect(getTakenSymbols).toHaveBeenCalledWith("voucher", "KVKS", expect.anything());
      expect(screen.getByText("1 Kivukoni School Voucher = 1 KES")).toBeTruthy();
    });

    it("suggests as soon as Advanced unfolds, without waiting for Next", async () => {
      renderFlow(<CreateVoucherFlow step="voucher" />);

      // The field lives inside the disclosure, so a suggestion made only on the
      // way out of the step is one the issuer never sees being made.
      fireEvent.change(screen.getByLabelText("Voucher Name"), {
        target: { value: "Kilifi Harvest" },
      });
      fireEvent.click(screen.getByText("Advanced"));

      await waitFor(() => expect(symbolInput().value).toBe("KLFH"));
    });

    it("skips to the first free numbered candidate when the stem is taken", async () => {
      getTakenSymbols.mockResolvedValue({ kind: "voucher", prefix: "KVKS", taken: ["KVKS"] });
      renderFlow(<CreateVoucherFlow step="voucher" />);
      fireEvent.click(screen.getByText("Advanced"));

      const name = screen.getByLabelText("Voucher Name");
      fireEvent.change(name, { target: { value: "Kivukoni School Voucher" } });
      fireEvent.blur(name);

      await waitFor(() => expect(symbolInput().value).toBe("KVKS2"));
    });

    it("still suggests the bare stem when the occupancy lookup fails", async () => {
      getTakenSymbols.mockRejectedValue(new Error("Not Found"));
      renderFlow(<CreateVoucherFlow step="voucher" />);
      fireEvent.click(screen.getByText("Advanced"));

      const name = screen.getByLabelText("Voucher Name");
      fireEvent.change(name, { target: { value: "Kilifi Harvest" } });
      fireEvent.blur(name);

      await waitFor(() => expect(symbolInput().value).toBe("KLFH"));
    });

    it("suggests before validating when the issuer goes straight to Next", async () => {
      renderFlow(<CreateVoucherFlow step="voucher" />);

      fireEvent.change(screen.getByLabelText("Voucher Name"), {
        target: { value: "Kilifi Harvest" },
      });
      fireEvent.change(screen.getByLabelText("Voucher Description"), {
        target: { value: "Fresh food from Kilifi producers." },
      });
      fireEvent.change(screen.getByLabelText("Create vouchers"), { target: { value: "10000" } });
      fireEvent.click(screen.getByRole("button", { name: "Next" }));

      await waitFor(() =>
        expect(navigateMock).toHaveBeenCalledWith({
          to: "/vouchers/create/$step",
          params: { step: "place" },
        }),
      );
      expect(symbolInput().value).toBe("KLFH");
    });

    it("leaves a symbol the issuer typed alone when the name changes", async () => {
      renderFlow(<CreateVoucherFlow step="voucher" />);
      const name = screen.getByLabelText("Voucher Name");

      fireEvent.change(name, { target: { value: "Kilifi Harvest" } });
      fireEvent.blur(name);
      await waitFor(() => expect(symbolInput().value).toBe("KLFH"));

      fireEvent.change(symbolInput(), { target: { value: "kivs" } });
      fireEvent.change(name, { target: { value: "Kivukoni School Voucher" } });
      fireEvent.blur(name);

      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(symbolInput().value).toBe("KIVS");
      expect(getTakenSymbols).toHaveBeenCalledTimes(1);

      // Clearing the field hands it back to the suggestion.
      fireEvent.change(symbolInput(), { target: { value: "" } });
      fireEvent.blur(name);
      await waitFor(() => expect(symbolInput().value).toBe("KVKS"));
    });

    it("does not overwrite the symbol of a restored draft", async () => {
      useVoucherCreateDraft.getState().setDraft({
        name: "Kilifi Harvest",
        symbol: "KHV",
        price: "1",
        unitOfAccount: "KES",
        description: "Fresh food from Kilifi producers.",
        voucherType: "standard",
        expiryDate: "",
        decimals: "6",
        supply: "1000",
        location: { locationName: "Kilifi, Kenya", country: "KE", lat: -3.5107, lng: 39.9093 },
        tags: [],
        email: "",
        website: "",
        phone: "",
        terms: "",
        iconUrl: "",
        markerIcon: null,
        markerColor: null,
        acceptedTerms: true,
      });
      renderFlow(<CreateVoucherFlow step="voucher" />);

      const name = screen.getByLabelText("Voucher Name");
      fireEvent.change(name, { target: { value: "Kivukoni School Voucher" } });
      fireEvent.blur(name);

      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(symbolInput().value).toBe("KHV");
      expect(getTakenSymbols).not.toHaveBeenCalled();
    });

    it("bumps a suggested symbol that was taken before publish", async () => {
      deployMutateAsync.mockResolvedValue({ trackingId: "tracking-1" });
      const view = renderFlow(<CreateVoucherFlow step="voucher" />);

      const name = screen.getByLabelText("Voucher Name");
      fireEvent.change(name, { target: { value: "Kilifi Harvest" } });
      fireEvent.blur(name);
      await waitFor(() => expect(symbolInput().value).toBe("KLFH"));
      fireEvent.change(screen.getByLabelText("Voucher Description"), {
        target: { value: "Fresh food from Kilifi producers." },
      });
      fireEvent.change(screen.getByLabelText("Create vouchers"), { target: { value: "10000" } });

      fireEvent.click(screen.getByRole("button", { name: "Next" }));
      await waitFor(() =>
        expect(navigateMock).toHaveBeenCalledWith(
          expect.objectContaining({ params: { step: "place" } }),
        ),
      );
      view.rerender(<CreateVoucherFlow step="place" />);
      fireEvent.click(screen.getByRole("button", { name: "Choose Kilifi, Kenya" }));

      // Someone else claimed the stem after the blur lookup was cached.
      getTakenSymbols.mockResolvedValue({ kind: "voucher", prefix: "KLFH", taken: ["KLFH"] });
      view.queryClient.clear();

      view.rerender(<CreateVoucherFlow step="review" />);
      fireEvent.click(screen.getByRole("checkbox", { name: "Accept Terms and Conditions" }));
      fireEvent.click(screen.getByRole("button", { name: "Confirm & Publish" }));

      await waitFor(() =>
        expect(deployMutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({ symbol: "KLFH2" }),
        ),
      );
    });
  });
});

it("blocks a new voucher form when its allowance is exhausted", async () => {
  quotaMock.data.vouchers.canCreate = false;
  renderFlow(<CreateVoucherFlow step="voucher" />);
  expect(
    screen.getByText("Limit reached. Ask an administrator to increase your allowance."),
  ).toBeTruthy();
  expect(screen.queryByLabelText("Create vouchers")).toBeNull();
  expect(deployMutateAsync).not.toHaveBeenCalled();
});
