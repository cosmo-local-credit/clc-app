import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const { deployMutateAsync, exitVoucherCreateHistoryMock, navigateMock } = vi.hoisted(() => ({
  deployMutateAsync: vi.fn(),
  exitVoucherCreateHistoryMock: vi.fn(),
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
  useConnection: () => ({ address: "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d" }),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock("#/lib/navigation/voucher-create-history", () => ({
  beginVoucherCreateHistory: vi.fn(),
  exitVoucherCreateHistory: exitVoucherCreateHistoryMock,
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

vi.mock("#/hooks/use-deployment", () => ({
  useTokenTags: () => ({
    data: ["Agriculture", "Food production"],
    isError: false,
    isPending: false,
    refetch: vi.fn(),
  }),
}));

import { CreateVoucherFlow } from "./create-voucher-flow";

afterEach(() => {
  vi.clearAllMocks();
});

describe("CreateVoucherFlow", () => {
  it("keeps form state across all three routes and deploys only after confirmation", async () => {
    deployMutateAsync.mockResolvedValue({ trackingId: "tracking-1" });
    const view = render(<CreateVoucherFlow step="voucher" />);

    fireEvent.change(screen.getByLabelText("Voucher Name"), {
      target: { value: "Kilifi Harvest" },
    });
    fireEvent.change(screen.getByLabelText("Voucher Symbol"), { target: { value: "khv" } });
    fireEvent.change(screen.getByLabelText("Voucher Description"), {
      target: { value: "Fresh food from Kilifi producers." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith({
        to: "/vouchers/create/$step",
        params: { step: "place" },
      }),
    );

    view.rerender(<CreateVoucherFlow step="place" />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Kilifi, Kenya" }));
    fireEvent.click(screen.getByRole("button", { name: "Agriculture" }));
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

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Confirm & Publish" }));

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
      }),
    );
    expect(exitVoucherCreateHistoryMock).toHaveBeenCalledWith({
      history: expect.any(Object),
      destination: "/vouchers/create/receipt?trackingId=tracking-1",
    });
  });

  it("enables and requires the expiry date as soon as the voucher is marked expiring", async () => {
    render(<CreateVoucherFlow step="voucher" />);
    fireEvent.change(screen.getByLabelText("Voucher Name"), { target: { value: "Kilifi" } });
    fireEvent.change(screen.getByLabelText("Voucher Symbol"), { target: { value: "KHV" } });
    fireEvent.change(screen.getByLabelText("Voucher Description"), {
      target: { value: "Fresh food." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Advanced" }));

    const expiry = () => screen.getByLabelText("Expiration Date") as HTMLInputElement;
    expect(expiry().disabled).toBe(true);

    fireEvent.click(screen.getByRole("radio", { name: /Expiring/ }));
    expect(expiry().disabled).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Choose an expiration date")).toBeTruthy();
    expect(navigateMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ params: { step: "place" } }),
    );

    fireEvent.change(expiry(), { target: { value: "2099-12-31" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith({
        to: "/vouchers/create/$step",
        params: { step: "place" },
      }),
    );
  });

  it("does not advance while required voucher fields are empty", async () => {
    render(<CreateVoucherFlow step="voucher" />);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText("Voucher name is required")).toBeTruthy();
    expect(navigateMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ params: { step: "place" } }),
    );
  });
});
