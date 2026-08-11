import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const { deployMutateAsync, exitPoolCreateHistoryMock, navigateMock } = vi.hoisted(() => ({
  deployMutateAsync: vi.fn(),
  exitPoolCreateHistoryMock: vi.fn(),
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
    },
  }),
}));

vi.mock("wagmi", () => ({
  useConnection: () => ({
    address: "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d",
    chainId: 42220,
  }),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

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

import { usePoolCreateDraft } from "#/features/pools/state/pool-create-draft";
import { CreatePoolFlow } from "./create-pool-flow";

afterEach(() => {
  vi.clearAllMocks();
  usePoolCreateDraft.getState().clearDraft();
});

describe("CreatePoolFlow", () => {
  it("uses compact guidance and the standard advanced disclosure", () => {
    render(<CreatePoolFlow step="pool" />);

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
  });

  it("does not expose pool decimals for editing", () => {
    render(<CreatePoolFlow step="pool" />);

    fireEvent.click(screen.getByText("Advanced"));

    expect(screen.queryByLabelText("Decimals")).toBeNull();
  });

  it("defaults the pool swap fee to zero percent", () => {
    render(<CreatePoolFlow step="pool" />);

    fireEvent.click(screen.getByText("Advanced"));

    expect((screen.getByLabelText("Swap Fee (%)") as HTMLInputElement).value).toBe("0");
  });

  it("shows a checkbox for separate fees only when the swap fee is above zero", () => {
    render(<CreatePoolFlow step="pool" />);

    fireEvent.click(screen.getByText("Advanced"));
    const fee = screen.getByLabelText("Swap Fee (%)");
    expect(screen.queryByRole("checkbox", { name: /Take fees separately/ })).toBeNull();

    fireEvent.change(fee, { target: { value: "0.5" } });

    const separateFees = screen.getByRole("checkbox", { name: /Take fees separately/ });
    expect(separateFees.getAttribute("data-slot")).toBe("checkbox");

    fireEvent.change(fee, { target: { value: "0" } });
    expect(screen.queryByRole("checkbox", { name: /Take fees separately/ })).toBeNull();
  });

  it("keeps tags compact and prefills contact details from the profile", async () => {
    render(<CreatePoolFlow step="place" />);

    await waitFor(() => {
      expect((screen.getByLabelText("Contact Email") as HTMLInputElement).value).toBe(
        "steward@example.org",
      );
      expect((screen.getByLabelText("Contact Phone") as HTMLInputElement).value).toBe("712 345678");
    });
    expect(screen.getByLabelText("Contact Website")).toBeTruthy();
    expect(screen.queryByText(/Public — pool members/)).toBeNull();

    const tagSearch = screen.getByRole("combobox", { name: "Search pool tags" });
    expect(screen.queryByRole("option", { name: "Agriculture" })).toBeNull();

    fireEvent.click(tagSearch);
    fireEvent.click(await screen.findByRole("option", { name: "Agriculture" }));

    expect(screen.getByRole("button", { name: "Remove Agriculture" })).toBeTruthy();

    fireEvent.pointerDown(screen.getByLabelText("Contact Email"));
    expect(screen.queryByRole("option", { name: "Agriculture" })).toBeNull();
  });

  it("collects an optional pool terms URL", () => {
    render(<CreatePoolFlow step="place" />);

    const terms = screen.getByLabelText("Terms URL");
    expect(terms.getAttribute("type")).toBe("url");
    expect(screen.getByText("Link to the terms that apply to this pool")).toBeTruthy();
  });

  it("requires both linked legal agreements before publishing", () => {
    render(<CreatePoolFlow step="review" />);

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
    const view = render(<CreatePoolFlow step="pool" />);

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
    fireEvent.click(screen.getByRole("button", { name: "Choose Kilifi, Kenya" }));
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
        quoterType: "oracle",
        feesDecoupled: false,
        feePolicyDefault: "0",
        baseCurrency: "0x456a3D042C0DbD3db53D5489e98dFb038553B0d0",
        description: "A pool for Kilifi growers.",
        email: "steward@example.org",
        website: "https://kilifi.example",
        terms: "https://kilifi.example/terms",
        phone: "+254712345678",
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
    expect(deployMutateAsync.mock.calls[0]?.[0]).not.toHaveProperty("unit");
    expect(deployMutateAsync.mock.calls[0]?.[0]).not.toHaveProperty("bannerUrl");
  });

  it("does not advance while required pool fields are empty", async () => {
    render(<CreatePoolFlow step="pool" />);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText("Pool name must be at least 3 characters")).toBeTruthy();
    expect(navigateMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ params: { step: "place" } }),
    );
  });
});
