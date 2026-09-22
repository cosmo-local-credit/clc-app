import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const {
  deployMutateAsync,
  exitPoolCreateHistoryMock,
  getNameAvailability,
  getTakenSymbols,
  navigateMock,
} = vi.hoisted(() => ({
  deployMutateAsync: vi.fn(),
  exitPoolCreateHistoryMock: vi.fn(),
  getNameAvailability: vi.fn(),
  getTakenSymbols: vi.fn(),
  navigateMock: vi.fn(),
}));

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
  useConnection: () => ({
    address: "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d",
    chainId: 42220,
  }),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }));

vi.mock("#/lib/api/symbols", () => ({ symbolsClient: { getTakenSymbols } }));
vi.mock("#/lib/api/names", () => ({ namesClient: { getNameAvailability } }));

vi.mock("#/lib/navigation/pool-create-history", () => ({
  beginPoolCreateHistory: vi.fn(),
  exitPoolCreateHistory: exitPoolCreateHistoryMock,
}));

vi.mock("#/components/ui/location-picker", () => ({
  LocationPicker: ({
    value,
    onChange,
  }: {
    value?: { locationName: string };
    onChange: (value: { locationName: string; country: string; lat: number; lng: number }) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onChange({ locationName: "Kilifi, Kenya", country: "KE", lat: -3.5107, lng: 39.9093 })
      }
    >
      {value?.locationName ?? "Choose Kilifi, Kenya"}
    </button>
  ),
}));

vi.mock("#/features/pools/hooks/use-pool-deployment", () => ({
  useDeployPool: () => ({
    error: null,
    isPending: false,
    mutateAsync: deployMutateAsync,
  }),
}));

vi.mock("#/features/auth/hooks/use-profile", () => ({
  useAuthProfile: () => ({
    data: {
      email: "steward@example.org",
      phone: "+254712345678",
      website: "https://steward.example",
      bio: "We grow and trade around Kilifi.",
      preferredCurrency: "USD",
      country: "KE",
      locationName: "Kilifi, Kenya",
      geoLat: -3.5107,
      geoLng: 39.9093,
      avatarUrl: "https://cdn.test/profile/avatar.webp",
    },
  }),
}));

vi.mock("#/lib/api/storage", () => ({ isStorageConfigured: true }));

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
    purpose: "pool.image" | "pool.banner";
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

vi.mock("#/hooks/use-deployment", () => ({
  useTokenTags: () => ({
    data: ["Agriculture", "Market"],
    isError: false,
    isPending: false,
    refetch: vi.fn(),
  }),
}));

import { usePoolCreateDraft } from "#/features/pools/state/pool-create-draft";
import { BackendApiError } from "@clc/api/client/errors";
import { toast } from "sonner";

import { CreatePoolFlow } from "./create-pool-flow";

/** The flow reads symbol occupancy through the query cache, so it needs a client. */
function renderFlow(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

beforeEach(() => {
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
  usePoolCreateDraft.getState().clearDraft();
});

describe("CreatePoolFlow", () => {
  it("uses compact guidance and the standard advanced disclosure", () => {
    renderFlow(<CreatePoolFlow step="pool" />);

    expect(screen.getByRole("heading", { level: 1, name: "Create pool" })).toBeTruthy();

    const guidance = screen.getByText(/A pool holds vouchers together/);
    expect(guidance.tagName).toBe("P");
    expect(guidance.classList).toContain("leading-snug");
    const guidanceTitle = screen.getByText("What's a pool?");
    expect(guidanceTitle.classList).toContain("bg-info/[0.08]");
    expect(guidanceTitle.classList).toContain("text-info");
    expect(guidanceTitle.closest("aside")?.classList).toContain("bg-card");

    const advancedSummary = screen.getByText("Advanced");
    expect(advancedSummary.tagName).toBe("SUMMARY");
    const advancedDetails = advancedSummary.closest("details") as HTMLDetailsElement;
    expect(advancedDetails.open).toBe(false);

    fireEvent.click(advancedSummary);
    expect(advancedDetails.open).toBe(true);
    expect(advancedDetails.contains(screen.getByLabelText("Pool Shortcode"))).toBe(true);
  });

  it("does not expose pool decimals for editing", () => {
    renderFlow(<CreatePoolFlow step="pool" />);

    fireEvent.click(screen.getByText("Advanced"));

    expect(screen.queryByLabelText("Decimals")).toBeNull();
  });

  it("defaults the pool swap fee to zero percent", () => {
    renderFlow(<CreatePoolFlow step="pool" />);

    fireEvent.click(screen.getByText("Advanced"));

    expect((screen.getByLabelText("Swap Fee (%)") as HTMLInputElement).value).toBe("0");
  });

  it("shows a checkbox for separate fees only when the swap fee is above zero", () => {
    renderFlow(<CreatePoolFlow step="pool" />);

    fireEvent.click(screen.getByText("Advanced"));
    const fee = screen.getByLabelText("Swap Fee (%)");
    expect(screen.queryByRole("checkbox", { name: /Take fees separately/ })).toBeNull();

    fireEvent.change(fee, { target: { value: "0.5" } });

    const separateFees = screen.getByRole("checkbox", { name: /Take fees separately/ });
    expect(separateFees.getAttribute("data-slot")).toBe("checkbox");

    fireEvent.change(fee, { target: { value: "0" } });
    expect(screen.queryByRole("checkbox", { name: /Take fees separately/ })).toBeNull();
  });

  it("asks where fees go as soon as one is charged, whatever decoupling says", async () => {
    const view = renderFlow(<CreatePoolFlow step="pool" />);

    fireEvent.click(screen.getByText("Advanced"));
    expect(screen.queryByLabelText("Fee recipient")).toBeNull();

    // The recipient follows the fee, not the "take fees separately" checkbox:
    // SwapPool settles `withdraw` to `feeAddress` in both modes.
    fireEvent.change(screen.getByLabelText("Swap Fee (%)"), { target: { value: "0.5" } });
    const recipient = screen.getByLabelText("Fee recipient") as HTMLInputElement;
    expect(recipient.value).toBe("0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d");

    fireEvent.change(recipient, { target: { value: "not-an-address" } });
    fireEvent.blur(recipient);
    expect((await screen.findByRole("alert")).textContent).toBe("Enter a valid wallet address");

    fireEvent.change(recipient, {
      target: { value: "0x9999999999999999999999999999999999999999" },
    });
    fireEvent.blur(recipient);
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());

    // Ticking and unticking the checkbox leaves the typed address alone.
    fireEvent.click(screen.getByRole("checkbox", { name: /Take fees separately/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Take fees separately/ }));
    expect((screen.getByLabelText("Fee recipient") as HTMLInputElement).value).toBe(
      "0x9999999999999999999999999999999999999999",
    );

    view.rerender(<CreatePoolFlow step="review" />);
    // Shown in the app's ellipsis format rather than as forty raw hex digits.
    expect(screen.queryByText("0x9999999999999999999999999999999999999999")).toBeNull();
    expect(screen.getByText("9999")).toBeTruthy();
  });

  it("drops the recipient when the fee goes back to zero", () => {
    renderFlow(<CreatePoolFlow step="pool" />);

    fireEvent.click(screen.getByText("Advanced"));
    fireEvent.change(screen.getByLabelText("Swap Fee (%)"), { target: { value: "0.5" } });
    expect(screen.getByLabelText("Fee recipient")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Swap Fee (%)"), { target: { value: "0" } });
    expect(screen.queryByLabelText("Fee recipient")).toBeNull();
  });

  it("keeps tags compact and prefills contact details from the profile", async () => {
    renderFlow(<CreatePoolFlow step="place" />);

    await waitFor(() => {
      expect((screen.getByLabelText("Contact Email") as HTMLInputElement).value).toBe(
        "steward@example.org",
      );
      expect((screen.getByLabelText("Contact Phone") as HTMLInputElement).value).toBe("712 345678");
    });
    expect((screen.getByLabelText("Contact Website") as HTMLInputElement).value).toBe(
      "https://steward.example",
    );
    expect(screen.queryByText(/Public — pool members/)).toBeNull();

    const tagSearch = screen.getByRole("combobox", { name: "Search pool tags" });
    expect(screen.queryByRole("option", { name: "Agriculture" })).toBeNull();

    fireEvent.click(tagSearch);
    fireEvent.click(await screen.findByRole("option", { name: "Agriculture" }));

    expect(screen.getByRole("button", { name: "Remove Agriculture" })).toBeTruthy();

    fireEvent.pointerDown(screen.getByLabelText("Contact Email"));
    expect(screen.queryByRole("option", { name: "Agriculture" })).toBeNull();
  });

  it("seeds the location, logo and unit from the saved profile", async () => {
    const view = renderFlow(<CreatePoolFlow step="place" />);

    await waitFor(() =>
      expect(screen.getByTestId("pool.image-value").textContent).toBe(
        "https://cdn.test/profile/avatar.webp",
      ),
    );
    expect(screen.getByRole("button", { name: "Kilifi, Kenya" })).toBeTruthy();
    expect(screen.queryByText("Cover photo")).toBeNull();

    view.rerender(<CreatePoolFlow step="pool" />);
    expect((screen.getByLabelText("Pool Description") as HTMLTextAreaElement).value).toBe(
      "We grow and trade around Kilifi.",
    );
    expect((screen.getByLabelText("Unit of Account") as HTMLInputElement).value).toContain("USD");
  });

  it("does not advance while a pool image is still uploading", () => {
    renderFlow(<CreatePoolFlow step="place" />);

    fireEvent.click(screen.getByRole("button", { name: "Start Logo upload" }));
    expect((screen.getByRole("button", { name: "Uploading…" }) as HTMLButtonElement).disabled).toBe(
      true,
    );

    fireEvent.click(screen.getByRole("button", { name: "Finish Logo upload" }));
    expect((screen.getByRole("button", { name: "Next" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("collects an optional pool terms URL", () => {
    renderFlow(<CreatePoolFlow step="place" />);

    const terms = screen.getByLabelText("Terms URL");
    expect(terms.getAttribute("type")).toBe("url");
    expect(screen.getByText("Link to the terms that apply to this pool")).toBeTruthy();
  });

  it("lets the steward write pool terms as Markdown instead of linking", () => {
    renderFlow(<CreatePoolFlow step="place" />);

    fireEvent.click(screen.getByRole("switch", { name: "Write my own" }));
    const terms = screen.getByLabelText("Shown to anyone joining this pool");
    fireEvent.change(terms, {
      target: { value: "# House rules\n\nSettle every **Friday**." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    expect(screen.getByRole("heading", { level: 3, name: "House rules" })).toBeTruthy();
    expect(screen.getByText("Friday", { selector: "strong" })).toBeTruthy();
  });

  it("defaults to relative pricing and offers equal and oracle pricing in Advanced", () => {
    renderFlow(<CreatePoolFlow step="pool" />);
    fireEvent.click(screen.getByText("Advanced"));

    expect(
      screen.getByRole("radio", { name: /Relative pricing/ }).hasAttribute("data-checked"),
    ).toBe(true);
    expect(screen.getByText("Equal value")).toBeTruthy();
    expect(screen.getByText("Oracle pricing")).toBeTruthy();
  });

  it("searches the complete unit-of-account catalog", async () => {
    renderFlow(<CreatePoolFlow step="pool" />);

    const currency = screen.getByRole("combobox", { name: "Unit of Account" });
    fireEvent.click(currency);
    fireEvent.change(currency, { target: { value: "Tanzanian" } });
    fireEvent.click(await screen.findByRole("option", { name: "TZS - Tanzanian Shilling" }));

    await waitFor(() =>
      expect((currency as HTMLInputElement).value).toBe("TZS - Tanzanian Shilling"),
    );
  });

  it("requires both linked legal agreements before publishing", () => {
    renderFlow(<CreatePoolFlow step="review" />);

    const terms = screen.getByRole("checkbox", { name: "Accept Terms and Conditions" });
    const sproutLicense = screen.getByRole("checkbox", { name: "Accept SPROUT License" });
    const publish = screen.getByRole("button", { name: "Confirm & Publish" });

    expect(screen.getByRole("link", { name: "Terms and Conditions" }).getAttribute("href")).toBe(
      "https://grassecon.org/pages/terms-and-conditions",
    );
    expect(screen.getByRole("link", { name: "SPROUT License" }).getAttribute("href")).toBe(
      "https://docs.grassecon.org/commons/sprout/",
    );
    expect((publish as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(terms);
    expect((publish as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(sproutLicense);
    expect((publish as HTMLButtonElement).disabled).toBe(false);
  });

  it("keeps form state across all three routes and deploys only supported API fields", async () => {
    deployMutateAsync.mockResolvedValue({ trackingId: "tracking-1" });
    const view = renderFlow(<CreatePoolFlow step="pool" />);

    fireEvent.change(screen.getByLabelText("Pool Name"), {
      target: { value: "Kilifi Growers" },
    });
    fireEvent.change(screen.getByLabelText("Pool Shortcode"), { target: { value: "kgp1" } });
    fireEvent.change(screen.getByLabelText("Pool Description"), {
      target: { value: "A pool for Kilifi growers." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith({
        to: "/pools/create/$step",
        params: { step: "place" },
      }),
    );

    view.rerender(<CreatePoolFlow step="place" />);
    fireEvent.change(screen.getByLabelText("Contact Website"), {
      target: { value: "https://kilifi.example" },
    });
    fireEvent.change(screen.getByLabelText("Terms URL"), {
      target: { value: "https://kilifi.example/terms" },
    });
    fireEvent.click(screen.getByRole("combobox", { name: "Search pool tags" }));
    fireEvent.click(await screen.findByRole("option", { name: "Agriculture" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith({
        to: "/pools/create/$step",
        params: { step: "review" },
      }),
    );

    view.rerender(<CreatePoolFlow step="review" />);
    expect(screen.getByText("Kilifi Growers")).toBeTruthy();
    expect(screen.getByText("KGP1")).toBeTruthy();
    expect(screen.getByText("Kilifi, Kenya")).toBeTruthy();
    expect(screen.getByText("https://kilifi.example/terms")).toBeTruthy();

    for (const checkbox of screen.getAllByRole("checkbox")) fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole("button", { name: "Confirm & Publish" }));

    await waitFor(() =>
      expect(deployMutateAsync).toHaveBeenCalledWith({
        name: "Kilifi Growers",
        symbol: "KGP1",
        decimals: "6",
        owner: "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d",
        quoterType: "relative",
        feesDecoupled: false,
        feePolicyDefault: "0",
        unitOfAccount: "USD",
        description: "A pool for Kilifi growers.",
        email: "steward@example.org",
        website: "https://kilifi.example",
        terms: "https://kilifi.example/terms",
        phone: "+254712345678",
        imageUrl: "https://cdn.test/profile/avatar.webp",
        locationName: "Kilifi, Kenya",
        geoLat: -3.5107,
        geoLng: 39.9093,
        tags: ["Agriculture"],
      }),
    );
    expect(exitPoolCreateHistoryMock).toHaveBeenCalledWith({
      history: expect.any(Object),
      destination: "/pools/create/receipt?trackingId=tracking-1",
    });
    expect(deployMutateAsync.mock.calls[0]?.[0]).toHaveProperty("unitOfAccount", "USD");
    expect(deployMutateAsync.mock.calls[0]?.[0]).not.toHaveProperty("bannerUrl");
  });

  it("warns while typing that a pool name is already taken, and refuses Next", async () => {
    getNameAvailability.mockImplementation(async (kind: string, name: string) => ({
      kind,
      name,
      available: name.toLowerCase() !== "kilifi growers",
    }));
    renderFlow(<CreatePoolFlow step="pool" />);

    fireEvent.change(screen.getByLabelText("Pool Name"), {
      target: { value: "Kilifi Growers" },
    });
    expect(await screen.findByText("That pool name is already taken")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(getNameAvailability).toHaveBeenCalled());
    expect(navigateMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ params: { step: "place" } }),
    );
    expect(getNameAvailability).toHaveBeenCalledWith("pool", "Kilifi Growers", expect.anything());
  });

  it("treats an unreachable availability lookup as no answer rather than a block", async () => {
    getNameAvailability.mockRejectedValue(new Error("offline"));
    renderFlow(<CreatePoolFlow step="pool" />);

    fireEvent.change(screen.getByLabelText("Pool Name"), {
      target: { value: "Kilifi Growers" },
    });
    fireEvent.change(screen.getByLabelText("Pool Shortcode"), { target: { value: "kgp1" } });
    fireEvent.change(screen.getByLabelText("Pool Description"), {
      target: { value: "A pool for Kilifi growers." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith({
        to: "/pools/create/$step",
        params: { step: "place" },
      }),
    );
    expect(screen.queryByText("That pool name is already taken")).toBeNull();
  });

  it("sends the steward back to the name when the backend reports it was taken", async () => {
    deployMutateAsync.mockRejectedValue(
      new BackendApiError(409, "a pool with this name already exists", "E16"),
    );
    const view = renderFlow(<CreatePoolFlow step="pool" />);

    fireEvent.change(screen.getByLabelText("Pool Name"), {
      target: { value: "Kilifi Growers" },
    });
    fireEvent.change(screen.getByLabelText("Pool Shortcode"), { target: { value: "kgp1" } });
    fireEvent.change(screen.getByLabelText("Pool Description"), {
      target: { value: "A pool for Kilifi growers." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith(
        expect.objectContaining({ params: { step: "place" } }),
      ),
    );

    view.rerender(<CreatePoolFlow step="place" />);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith(
        expect.objectContaining({ params: { step: "review" } }),
      ),
    );

    view.rerender(<CreatePoolFlow step="review" />);
    for (const checkbox of screen.getAllByRole("checkbox")) fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole("button", { name: "Confirm & Publish" }));

    await waitFor(() => expect(deployMutateAsync).toHaveBeenCalled());
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith({
        to: "/pools/create/$step",
        params: { step: "pool" },
      }),
    );
    expect(toast.error).toHaveBeenCalledWith(
      "That pool name was taken while you were filling this in.",
    );
    expect(exitPoolCreateHistoryMock).not.toHaveBeenCalled();
  });

  it("does not advance while required pool fields are empty", async () => {
    renderFlow(<CreatePoolFlow step="pool" />);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText("Pool name must be at least 3 characters")).toBeTruthy();
    expect(navigateMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ params: { step: "place" } }),
    );
  });

  describe("shortcode suggestion", () => {
    const symbolInput = () => screen.getByLabelText("Pool Shortcode") as HTMLInputElement;

    it("fills the shortcode from the name once the name blurs", async () => {
      renderFlow(<CreatePoolFlow step="pool" />);

      const name = screen.getByLabelText("Pool Name");
      fireEvent.change(name, { target: { value: "Kawangware Community Pool" } });
      fireEvent.blur(name);

      await waitFor(() => expect(symbolInput().value).toBe("KWNG"));
      expect(getTakenSymbols).toHaveBeenCalledWith("pool", "KWNG", expect.anything());
    });

    it("suggests as soon as Advanced unfolds, without waiting for Next", async () => {
      renderFlow(<CreatePoolFlow step="pool" />);

      fireEvent.change(screen.getByLabelText("Pool Name"), {
        target: { value: "Kilifi Growers" },
      });
      fireEvent.click(screen.getByText("Advanced"));

      await waitFor(() => expect(symbolInput().value).toBe("KLFG"));
    });

    it("skips to the first free numbered candidate when the stem is taken", async () => {
      getTakenSymbols.mockResolvedValue({ kind: "pool", prefix: "KWNG", taken: ["KWNG", "KWNG2"] });
      renderFlow(<CreatePoolFlow step="pool" />);

      const name = screen.getByLabelText("Pool Name");
      fireEvent.change(name, { target: { value: "Kawangware Community Pool" } });
      fireEvent.blur(name);

      await waitFor(() => expect(symbolInput().value).toBe("KWNG3"));
    });

    it("leaves a shortcode the steward typed alone when the name changes", async () => {
      renderFlow(<CreatePoolFlow step="pool" />);
      const name = screen.getByLabelText("Pool Name");

      fireEvent.change(name, { target: { value: "Kilifi Growers" } });
      fireEvent.blur(name);
      await waitFor(() => expect(symbolInput().value).toBe("KLFG"));

      fireEvent.change(symbolInput(), { target: { value: "kgp1" } });
      fireEvent.change(name, { target: { value: "Kawangware Community Pool" } });
      fireEvent.blur(name);

      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(symbolInput().value).toBe("KGP1");
      expect(getTakenSymbols).toHaveBeenCalledTimes(1);
    });
  });
});
