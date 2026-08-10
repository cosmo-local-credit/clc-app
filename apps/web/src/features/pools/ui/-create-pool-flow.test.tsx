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
    fireEvent.click(screen.getByRole("button", { name: "Agriculture" }));
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
        feePolicyDefault: "1",
        baseCurrency: "0x456a3D042C0DbD3db53D5489e98dFb038553B0d0",
        description: "A pool for Kilifi growers.",
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

    expect(await screen.findByText("Pool name is required")).toBeTruthy();
    expect(navigateMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ params: { step: "place" } }),
    );
  });

  it("requires both agreements before publishing", async () => {
    render(<CreatePoolFlow step="review" />);

    fireEvent.click(screen.getByRole("button", { name: "Confirm & Publish" }));

    expect(await screen.findByText("Accept the terms to publish your pool")).toBeTruthy();
    expect(screen.getByText("Accept the SPROUT License to publish your pool")).toBeTruthy();
    expect(deployMutateAsync).not.toHaveBeenCalled();
  });
});
