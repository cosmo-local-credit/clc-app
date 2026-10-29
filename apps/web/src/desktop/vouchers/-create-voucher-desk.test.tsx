import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { getNameAvailability, getTakenSymbols, navigateMock } = vi.hoisted(() => ({
  getNameAvailability: vi.fn(),
  getTakenSymbols: vi.fn(),
  navigateMock: vi.fn(),
}));

const quotaMock = vi.hoisted(() => ({
  data: {
    vouchers: { used: 0, limit: 5, canCreate: true as boolean, unlimited: false },
  },
  isPending: false,
  isError: false,
  isFetching: false,
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
  exitVoucherCreateHistory: vi.fn(),
}));
vi.mock("#/features/vouchers/hooks/use-voucher-deployment", () => ({
  useDeployVoucher: () => ({ error: null, isPending: false, mutateAsync: vi.fn() }),
}));
vi.mock("#/features/auth/hooks/use-profile", () => ({ useAuthProfile: () => ({ data: {} }) }));
vi.mock("#/hooks/use-deployment", () => ({
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
vi.mock("#/lib/api/storage", () => ({ isStorageConfigured: false }));
// WebGL has nothing to draw in jsdom; the box stands in for the map.
vi.mock("#/components/ui/location-map.lazy", () => ({
  LocationMap: () => <div data-testid="map" />,
}));

import { useVoucherCreateDraft } from "#/features/vouchers/state/voucher-create-draft";

import { CreateVoucherDesk } from "./create-voucher-desk";

function renderDesk(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

/** `<details>` reports a toggle in a later task; let the page see it. */
async function settleToggle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function advancedSection() {
  return screen.getByText("Advanced").closest("details") as HTMLDetailsElement;
}

beforeEach(() => {
  quotaMock.data.vouchers = { used: 0, limit: 5, canCreate: true, unlimited: false };
  quotaMock.isError = false;
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

describe("CreateVoucherDesk Advanced", () => {
  it("starts closed and says what it holds", () => {
    renderDesk(<CreateVoucherDesk step="voucher" />);

    const advanced = advancedSection();
    expect(advanced.open).toBe(false);
    // The closed summary carries the current pricing, so nothing is hidden blind.
    expect(within(advanced).getByText("1 KES")).toBeTruthy();
    // Every advanced setting is still in the section.
    expect(advanced.contains(screen.getByLabelText("Symbol"))).toBe(true);
    expect(advanced.contains(screen.getByLabelText("Price"))).toBe(true);
    expect(advanced.contains(screen.getByLabelText("Priced in"))).toBe(true);
  });

  it("opens for a restored draft", () => {
    useVoucherCreateDraft.getState().setDraft({
      name: "Kilifi Market",
      symbol: "KMKT",
      price: "5",
      unitOfAccount: "KES",
      description: "Fresh food.",
      voucherType: "standard",
      expiryDate: "",
      decimals: "6",
      supply: "10",
      location: { lat: -3.5, lng: 39.9, locationName: "Kilifi, Kenya", country: "KE" },
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
    renderDesk(<CreateVoucherDesk step="voucher" />);

    expect(advancedSection().open).toBe(true);
    expect((screen.getByLabelText("Price") as HTMLInputElement).value).toBe("5");
    expect((screen.getByLabelText("Symbol") as HTMLInputElement).value).toBe("KMKT");
  });

  it("opens when Next is refused for a value inside it, and stays closed otherwise", async () => {
    renderDesk(<CreateVoucherDesk step="voucher" />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Kilifi Market" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Fresh food." } });

    // A valid form leaves the section alone: the issuer never asked for it.
    expect(advancedSection().open).toBe(false);

    fireEvent.click(screen.getByText("Advanced"));
    await settleToggle();
    fireEvent.change(screen.getByLabelText("Price"), { target: { value: "0" } });
    fireEvent.click(screen.getByText("Advanced"));
    await settleToggle();
    expect(advancedSection().open).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => expect(advancedSection().open).toBe(true));
    expect(await screen.findByText("Price must be greater than zero")).toBeTruthy();
    expect(navigateMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ params: { step: "place" } }),
    );
  });
});

describe("CreateVoucherDesk concept help", () => {
  it("shows no persistent explanation, and offers it on request", async () => {
    renderDesk(<CreateVoucherDesk step="voucher" />);

    expect(screen.queryByText(/A voucher acts like a gift card/)).toBeNull();
    expect(screen.queryByRole("complementary", { name: "What's a voucher?" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "What's a voucher?" }));
    expect(await screen.findByText(/A voucher acts like a gift card/)).toBeTruthy();
  });
});

describe("CreateVoucherDesk usage meter", () => {
  it("shows an unlimited allowance as plain text with no progress bar", () => {
    quotaMock.data.vouchers = { used: 3, limit: 0, canCreate: true, unlimited: true };
    renderDesk(<CreateVoucherDesk step="voucher" />);

    expect(screen.getByText("3 used · Unlimited")).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("measures a finite allowance against its limit", () => {
    quotaMock.data.vouchers = { used: 3, limit: 5, canCreate: true, unlimited: false };
    renderDesk(<CreateVoucherDesk step="voucher" />);

    expect(screen.getByText("3 of 5 used")).toBeTruthy();
    const meter = screen.getByRole("progressbar");
    expect(meter.getAttribute("aria-valuenow")).toBe("3");
    expect(meter.getAttribute("aria-valuemax")).toBe("5");
  });

  it("says the limit is reached once, without a form", () => {
    quotaMock.data.vouchers = { used: 5, limit: 5, canCreate: false, unlimited: false };
    renderDesk(<CreateVoucherDesk step="voucher" />);

    expect(screen.getAllByText(/Limit reached/)).toHaveLength(1);
    expect(screen.queryByLabelText("Name")).toBeNull();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("5");
  });
});

describe("CreateVoucherDesk layout", () => {
  it("swaps the side stepper for a compact row when the canvas is narrow", () => {
    renderDesk(<CreateVoucherDesk step="place" />);

    const side = document.querySelector('[data-wizard-steps="side"]') as HTMLElement;
    const compact = document.querySelector('[data-wizard-steps="compact"]') as HTMLElement;
    // Both are in the markup; the canvas container decides which one is shown.
    expect(side.className).toContain("hidden");
    expect(side.className).toContain("@min-[43rem]:block");
    expect(compact.className).toContain("@min-[43rem]:hidden");
    expect(compact.className).not.toMatch(/(^|\s)hidden(\s|$)/);
    for (const steps of [side, compact]) {
      const labels = within(steps).getAllByRole("listitem");
      expect(labels).toHaveLength(3);
      expect(steps.textContent).toContain("Location and tags");
      expect(steps.textContent).toContain("Confirm and publish");
    }
    expect(compact.querySelector('[aria-current="step"]')?.textContent).toContain(
      "Location and tags",
    );
  });

  it("gives the preview a column only where it keeps 240px, and never hides it", () => {
    renderDesk(<CreateVoucherDesk step="place" />);

    const aside = screen.getByRole("complementary", { name: "Preview" });
    const grid = aside.parentElement as HTMLElement;
    // The third track appears at 62rem with a 240px floor...
    expect(grid.className).toContain(
      "@min-[62rem]:grid-cols-[minmax(160px,200px)_minmax(440px,560px)_minmax(240px,1fr)]",
    );
    expect(aside.className).toContain("@min-[62rem]:col-start-3");
    // ...below it the preview follows the form in the form's own column.
    expect(grid.className).toContain(
      "@min-[43rem]:grid-cols-[minmax(160px,200px)_minmax(440px,560px)]",
    );
    expect(aside.className).toContain("@min-[43rem]:col-start-2");
    expect(aside.className).toContain("@min-[43rem]:row-start-2");
    // There is no width at which it is switched off.
    expect(aside.className).not.toMatch(/(^|\s)(hidden|w-0)(\s|$)/);
    expect(within(aside).getByText("Preview · Market")).toBeTruthy();
    expect(within(aside).getByTestId("map")).toBeTruthy();
  });

  it("collapses the pricing pair to one column when the form is narrow", () => {
    renderDesk(<CreateVoucherDesk step="voucher" />);

    const pair = screen.getByLabelText("Price").closest(".grid") as HTMLElement;
    expect(pair.className).toContain("grid-cols-1");
    expect(pair.className).toContain("@min-[30rem]:grid-cols-2");
    expect(pair.parentElement?.className).toContain("@container");
  });
});

describe("CreateVoucherDesk copy", () => {
  it("uses sentence case, without the repeated resource name", () => {
    const view = renderDesk(<CreateVoucherDesk step="voucher" />);
    expect(screen.getByLabelText("Description")).toBeTruthy();
    expect(screen.queryByLabelText("Voucher Description")).toBeNull();

    view.unmount();
    renderDesk(<CreateVoucherDesk step="place" />);
    expect(screen.getByRole("heading", { level: 1, name: "Location and tags" })).toBeTruthy();
    expect(screen.getByLabelText("Contact email")).toBeTruthy();
  });
});
