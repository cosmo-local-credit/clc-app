import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Want } from "@clc/core/features/wants/logic";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { WantDetail } from "./want-detail";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const api = vi.hoisted(() => ({
  creatorVouchers: vi.fn(),
  creatorPools: vi.fn(),
  contact: vi.fn(),
}));
const auth = vi.hoisted(() => ({
  state: "authenticated",
  isLoading: false,
  isAuthenticated: true,
  session: { address: `0x${"a".repeat(40)}` } as { address: string } | undefined,
  retry: vi.fn(),
  retrying: false,
}));
vi.mock("sonner", () => ({ toast }));
vi.mock("#/lib/api/wants", () => ({ wantsClient: api }));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({ useAuthStatus: () => auth }));
vi.mock("#/components/ui/location-map.lazy", () => ({
  LocationMap: ({ markerStyle }: { markerStyle: { icon: string; color: string } }) => (
    <div data-testid="location-map">{`${markerStyle.icon}:${markerStyle.color}`}</div>
  ),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params = {},
    search,
    children,
    ...props
  }: {
    to: string;
    params?: Record<string, string>;
    search?: { step?: string; redirect?: string };
    children: ReactNode;
  }) => (
    <a
      href={
        to === "/onboarding"
          ? `/onboarding?step=${search?.step ?? ""}`
          : to
              .replace("$voucherAddress", params.voucherAddress ?? "")
              .replace("$poolAddress", params.poolAddress ?? "")
      }
      {...props}
    >
      {children}
    </a>
  ),
}));

const WANT: Want = {
  id: "7",
  name: "Bicycle repair",
  description: "Looking for help repairing a wheel",
  locationName: "Nairobi",
  geoLat: -1.286,
  geoLng: 36.817,
  startsAt: "2026-10-24T08:00:00.000Z",
  expiresAt: null,
  status: "OPEN",
  state: "active",
  tags: ["Repair", "Bicycle"],
  imageUrl: null,
  markerIcon: "question",
  markerColor: "orange",
  contact: {
    text: "Meet near the market",
    email: "amina@example.test",
    phone: "+254700000000",
  },
};

beforeEach(() => {
  toast.success.mockReset();
  toast.error.mockReset();
  Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
  api.creatorVouchers.mockReset().mockResolvedValue({ vouchers: [], first: 0, last: 0 });
  api.creatorPools.mockReset().mockResolvedValue({ pools: [], first: 0, last: 0 });
  api.contact.mockReset().mockResolvedValue(WANT.contact);
  auth.state = "authenticated";
  auth.isLoading = false;
  auth.isAuthenticated = true;
  auth.session = { address: `0x${"a".repeat(40)}` };
});

afterEach(() => vi.restoreAllMocks());

function queryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderWant(ui: ReactNode) {
  return render(<QueryClientProvider client={queryClient()}>{ui}</QueryClientProvider>);
}

function rerenderWant(rerender: (ui: ReactNode) => void, ui: ReactNode) {
  rerender(<QueryClientProvider client={queryClient()}>{ui}</QueryClientProvider>);
}

describe("Want detail", () => {
  it("shows scheduling, protected location, tags, description, and selected contacts to a signed-in user", async () => {
    renderWant(<WantDetail want={WANT} distanceOrigin={{ lat: -1.28, lng: 36.82 }} />);

    expect(screen.getByRole("heading", { name: "Bicycle repair" })).toBeTruthy();
    expect(screen.queryByText(/Wanted by/)).toBeNull();
    expect(screen.queryByText("Amina")).toBeNull();
    expect(screen.getByText("Repair")).toBeTruthy();
    expect(screen.getByText("Bicycle")).toBeTruthy();
    expect(screen.getByText("Looking for help repairing a wheel")).toBeTruthy();
    expect(await screen.findByText("Meet near the market")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Email" }).getAttribute("href")).toBe(
      "mailto:amina@example.test",
    );
    expect(screen.getByRole("link", { name: "Call" }).getAttribute("href")).toBe(
      "tel:+254700000000",
    );
    expect(screen.getByText("No ending date")).toBeTruthy();
    const locationLink = screen.getByText(/^Nairobi ·/).closest("a");
    expect(locationLink?.getAttribute("href")).toBe(
      "https://www.google.com/maps/search/?api=1&query=-1.286%2C36.817",
    );
    expect(locationLink?.getAttribute("target")).toBe("_blank");
  });

  it("keeps schedule public while gating exact location and contact for guests", () => {
    auth.state = "guest";
    auth.isAuthenticated = false;
    auth.session = undefined;
    renderWant(<WantDetail want={WANT} showLocationMap />);

    expect(screen.getByText("No ending date")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Sign in" })).toHaveLength(2);
    expect(screen.queryByText(/^Nairobi/)).toBeNull();
    expect(screen.queryByTestId("location-map")).toBeNull();
    expect(screen.queryByText("Meet near the market")).toBeNull();
    expect(api.contact).not.toHaveBeenCalled();
  });

  it("renders the selected marker only when the standalone location map is requested", () => {
    const { rerender } = renderWant(<WantDetail want={WANT} showLocationMap />);
    expect(screen.getByTestId("location-map").textContent).toBe("question:orange");

    rerenderWant(rerender, <WantDetail want={WANT} />);
    expect(screen.queryByTestId("location-map")).toBeNull();
  });

  it("shows creator vouchers and pools that accept them with independent pagination", async () => {
    const address = (digit: string) => `0x${digit.repeat(40)}`;
    api.creatorVouchers.mockImplementation((_id: string, params: { cursor?: number }) =>
      params.cursor
        ? Promise.resolve({
            vouchers: [
              {
                id: "1",
                chainId: 100,
                address: address("4"),
                name: "Fourth voucher",
                symbol: "V4",
                decimals: 6,
                iconUrl: null,
                active: true,
              },
            ],
            first: 1,
            last: 1,
          })
        : Promise.resolve({
            vouchers: ["1", "2", "3"].map((digit) => ({
              id: digit,
              chainId: 100,
              address: address(digit),
              name: `Voucher ${digit}`,
              symbol: `V${digit}`,
              decimals: 6,
              iconUrl: null,
              active: true,
            })),
            first: 3,
            last: 3,
          }),
    );
    api.creatorPools.mockResolvedValue({
      pools: [
        {
          id: "9",
          chainId: 100,
          address: address("9"),
          name: "Community Pool",
          symbol: "POOL",
          locationName: "Kilifi",
          imageUrl: null,
          voucherCount: 2,
          tags: [],
        },
      ],
      first: 9,
      last: 9,
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <WantDetail want={WANT} showRelated />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Vouchers" })).toBeTruthy();
    expect((await screen.findByRole("link", { name: /Community Pool/ })).getAttribute("href")).toBe(
      `/pools/${address("9")}`,
    );
    expect(screen.getByRole("link", { name: /Voucher 1/ }).getAttribute("href")).toBe(
      `/vouchers/${address("1")}`,
    );

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Fourth voucher")).toBeTruthy();
    expect(api.creatorVouchers).toHaveBeenLastCalledWith(
      "7",
      { perPage: 3, cursor: 3, next: true },
      expect.any(AbortSignal),
    );
  });

  it("keeps successful pool results visible when creator vouchers fail and retries independently", async () => {
    const poolAddress = `0x${"9".repeat(40)}`;
    api.creatorVouchers.mockRejectedValue(new Error("offline"));
    api.creatorPools.mockResolvedValue({
      pools: [
        {
          id: "9",
          chainId: 100,
          address: poolAddress,
          name: "Community Pool",
          symbol: "POOL",
          locationName: null,
          imageUrl: null,
          voucherCount: 1,
          tags: [],
        },
      ],
      first: 9,
      last: 9,
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <WantDetail want={WANT} showRelated />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Couldn't load vouchers.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Community Pool/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(api.creatorVouchers).toHaveBeenCalledTimes(2));
    expect(api.creatorPools).toHaveBeenCalledTimes(1);
  });

  it("uses the canonical public URL for native Share", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    renderWant(<WantDetail want={WANT} />);

    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() =>
      expect(share).toHaveBeenCalledWith({
        title: "Bicycle repair",
        url: `${window.location.origin}/wants/7`,
      }),
    );
  });

  it("falls back to the clipboard and reports a failed share without exposing contacts", async () => {
    const clipboard = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: clipboard },
    });
    const { rerender } = renderWant(<WantDetail want={{ ...WANT, contact: undefined }} />);

    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() =>
      expect(clipboard).toHaveBeenCalledWith(`${window.location.origin}/wants/7`),
    );
    expect(toast.success).toHaveBeenCalledWith("Link copied");
    expect(screen.queryByRole("link", { name: "Email" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Call" })).toBeNull();

    clipboard.mockRejectedValueOnce(new Error("blocked"));
    rerenderWant(rerender, <WantDetail want={WANT} />);
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't share this Want."));
  });
});
