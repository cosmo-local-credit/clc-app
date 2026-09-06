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

vi.mock("#/features/auth/hooks/use-profile", () => ({
  useAuthProfile: () => ({
    data: {
      email: "issuer@example.org",
      phone: "+254712345678",
    },
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
import { useVoucherCreateDraft } from "#/features/vouchers/state/voucher-create-draft";

afterEach(() => {
  vi.clearAllMocks();
  useVoucherCreateDraft.getState().clearDraft();
});

describe("CreateVoucherFlow", () => {
  it("uses compact guidance, issuer-facing pricing fields, and the standard disclosure pattern", () => {
    render(<CreateVoucherFlow step="voucher" />);

    expect(screen.getByRole("heading", { level: 1, name: "Create voucher" })).toBeTruthy();

    const guidance = screen.getByText(/A voucher acts like a gift card/);
    expect(guidance.tagName).toBe("P");
    expect(guidance.classList).toContain("leading-snug");
    const guidanceTitle = screen.getByText("What's a voucher?");
    expect(guidanceTitle.classList).toContain("bg-primary/[0.08]");
    expect(guidanceTitle.classList).toContain("text-primary");
    expect(guidanceTitle.closest("aside")?.classList).toContain("bg-card");

    const currency = screen.getByLabelText("Priced in");
    const price = screen.getByLabelText("Price");
    const pricingRow = document.querySelector('[data-slot="voucher-pricing-row"]');
    expect(pricingRow?.contains(price)).toBe(true);
    expect(pricingRow?.contains(currency)).toBe(true);
    expect(screen.queryByLabelText("Voucher Value")).toBeNull();
    expect(screen.queryByLabelText("Currency")).toBeNull();
    expect(screen.queryByLabelText("Unit of Account")).toBeNull();
    expect(document.querySelector('[data-slot="voucher-price-unit"]')?.textContent).toBe("KES");

    const advancedSummary = screen.getByText("Advanced");
    expect(advancedSummary.tagName).toBe("SUMMARY");
    const advancedDetails = advancedSummary.closest("details") as HTMLDetailsElement;
    expect(advancedDetails.open).toBe(false);

    fireEvent.click(advancedSummary);
    expect(advancedDetails.open).toBe(true);
  });

  it("previews the voucher price in its selected currency or measure", () => {
    render(<CreateVoucherFlow step="voucher" />);

    expect(screen.getByText("1 XYZ = 1 KES")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Voucher Symbol"), { target: { value: "khv" } });
    fireEvent.change(screen.getByLabelText("Price"), { target: { value: "10" } });

    expect(screen.getByText("1 KHV = 10 KES")).toBeTruthy();
  });

  it("searches the full currency list using code or currency name", async () => {
    render(<CreateVoucherFlow step="voucher" />);

    const currency = screen.getByRole("combobox", { name: "Priced in" });
    fireEvent.click(currency);
    expect(screen.getByRole("option", { name: "KES - Kenyan Shillings" })).toBeTruthy();
    expect(screen.queryByText(/KES —/)).toBeNull();

    fireEvent.change(currency, { target: { value: "Tanzanian" } });
    const tanzanianShilling = await screen.findByRole("option", {
      name: "TZS - Tanzanian Shilling",
    });
    fireEvent.pointerDown(tanzanianShilling, { pointerType: "touch" });
    fireEvent.click(tanzanianShilling);

    await waitFor(() =>
      expect((currency as HTMLInputElement).value).toBe("TZS - Tanzanian Shilling"),
    );
    expect(screen.getByText("1 XYZ = 1 TZS")).toBeTruthy();
  });

  it("keeps tags compact and prefills contact details from the profile", async () => {
    render(<CreateVoucherFlow step="place" />);

    await waitFor(() => {
      expect((screen.getByLabelText("Contact Email") as HTMLInputElement).value).toBe(
        "issuer@example.org",
      );
      expect((screen.getByLabelText("Contact Phone") as HTMLInputElement).value).toBe("712 345678");
    });
    expect(screen.getByLabelText("Contact Website")).toBeTruthy();
    expect(screen.queryByText(/Public — voucher holders/)).toBeNull();

    const tagSearch = screen.getByRole("combobox", { name: "Search voucher tags" });
    expect(screen.queryByRole("option", { name: "Agriculture" })).toBeNull();

    fireEvent.click(tagSearch);
    fireEvent.click(await screen.findByRole("option", { name: "Agriculture" }));

    expect(screen.getByRole("button", { name: "Remove Agriculture" })).toBeTruthy();

    fireEvent.pointerDown(screen.getByLabelText("Contact Email"));
    expect(screen.queryByRole("option", { name: "Agriculture" })).toBeNull();
  });

  it("collects an optional voucher terms URL", () => {
    render(<CreateVoucherFlow step="place" />);

    const terms = screen.getByLabelText("Terms URL");
    expect(terms.getAttribute("type")).toBe("url");
    expect(screen.getByText("Link to the terms that apply to this voucher")).toBeTruthy();
  });

  it("requires both linked legal agreements before publishing", () => {
    render(<CreateVoucherFlow step="review" />);

    const terms = screen.getByRole("checkbox", { name: "Accept Terms and Conditions" });
    const pathLicense = screen.getByRole("checkbox", { name: "Accept PATH License" });
    const publish = screen.getByRole("button", { name: "Confirm & Publish" });

    expect(screen.getByRole("link", { name: "Terms and Conditions" }).getAttribute("href")).toBe(
      "https://grassecon.org/pages/terms-and-conditions",
    );
    expect(screen.getByRole("link", { name: "PATH License" }).getAttribute("href")).toBe(
      "https://docs.grassecon.org/commons/path/",
    );
    expect((publish as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(terms);
    expect((publish as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(pathLicense);
    expect((publish as HTMLButtonElement).disabled).toBe(false);
  });

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
    fireEvent.change(screen.getByLabelText("Contact Website"), {
      target: { value: "https://kilifi.example" },
    });
    fireEvent.change(screen.getByLabelText("Terms URL"), {
      target: { value: "https://kilifi.example/terms" },
    });
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
    expect((publish as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "Accept PATH License" }));
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
    fireEvent.click(screen.getByText("Advanced"));

    expect(screen.queryByLabelText("Expiration Date")).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: /Expiring/ }));
    const expiry = () => screen.getByLabelText("Expiration Date") as HTMLInputElement;
    expect(expiry().disabled).toBe(false);

    fireEvent.click(screen.getByRole("radio", { name: /Standard/ }));
    expect(screen.queryByLabelText("Expiration Date")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: /Expiring/ }));

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

    expect(await screen.findByText("Voucher name must be at least 3 characters")).toBeTruthy();
    expect(navigateMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ params: { step: "place" } }),
    );
  });
});
