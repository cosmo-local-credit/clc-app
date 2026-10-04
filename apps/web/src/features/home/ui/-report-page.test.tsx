import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { ReportDetail, ReportImage } from "@clc/api/features/reports/client";

/**
 * Embla reads breakpoints and observes slide visibility and size on mount, and
 * jsdom implements none of those APIs. Stubbed here rather than in the shared
 * setup: app code reads `matchMedia` for theme and display-mode detection, and
 * other suites set their own, so a global stub would change what those tests
 * exercise.
 */
beforeAll(() => {
  class NoopObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", NoopObserver);

  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  );

  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
      root = null;
      rootMargin = "";
      thresholds = [];
    },
  );
});

const mocks = vi.hoisted(() => ({
  detail: {
    data: undefined as ReportDetail | undefined,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  },
  openDefaultMaps: vi.fn(),
  location: {
    data: {
      locationName: "Mathira, Nyeri, Kenya",
      country: "KE",
    } as { locationName: string; country: string } | null | undefined,
  },
  useReportLocation: vi.fn(),
  auth: {
    isAuthenticated: false,
    address: undefined as `0x${string}` | undefined,
  },
}));

vi.mock("#/features/home/hooks/use-reports", () => ({
  useReport: () => mocks.detail,
  useReportLocation: (lat: number | null | undefined, lng: number | null | undefined) => {
    mocks.useReportLocation(lat, lng);
    return typeof lat === "number" && typeof lng === "number"
      ? mocks.location
      : { data: undefined };
  },
}));

vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => mocks.auth,
}));

vi.mock("#/lib/default-maps", () => ({
  openDefaultMaps: mocks.openDefaultMaps,
}));

vi.mock("#/components/ui/location-map.lazy", () => ({
  LocationMap: ({ lat, lng }: { lat: number; lng: number }) => (
    <div data-testid="location-map" data-lat={lat} data-lng={lng} />
  ),
}));

// The card is covered on its own; here only that a voucher opens it.
const voucherSheet = vi.hoisted(() => ({ open: vi.fn() }));

vi.mock("#/lib/navigation/use-voucher-sheet-selection", () => ({
  useVoucherSheetSelection: () => ({
    voucher: null,
    voucherTab: "offerings",
    open: voucherSheet.open,
    close: () => {},
  }),
}));

vi.mock("#/components/vouchers/voucher-sheet", () => ({ VoucherSheet: () => null }));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    children,
    ...props
  }: {
    to: string;
    params?: Record<string, string>;
    search?: unknown;
    children: ReactNode;
  }) => {
    const path = Object.entries(params ?? {}).reduce(
      (value, [key, replacement]) => value.replace(`$${key}`, replacement),
      to,
    );
    return (
      <a href={path} {...props}>
        {children}
      </a>
    );
  },
  useRouter: () => ({ history: { back: vi.fn() } }),
  useCanGoBack: () => false,
}));

import { ReportPage } from "./report-page";

/**
 * One image row. The display box (`width`/`height`) is optional because uploads
 * only ever record the intrinsic pair, so most rows carry nulls there.
 */
function reportImage(
  url: string,
  box: { width: number; height: number } | null = null,
): ReportImage {
  return {
    url,
    width: box?.width ?? null,
    height: box?.height ?? null,
    maxWidth: box?.width ?? null,
    maxHeight: box?.height ?? null,
    byteSize: null,
    caption: null,
  };
}

function detail(overrides: Partial<ReportDetail> = {}): ReportDetail {
  return {
    id: "3182",
    title: "Harvesting greengrams",
    description: "7 members helped Patricia Makau harvest greengrams.",
    imageUrl: "https://content.example/one.jpg",
    locationName: "Kitui, KEN",
    lat: -1.29,
    lng: 36.82,
    periodFrom: "2026-07-01T00:00:00Z",
    periodTo: "2026-07-02T00:00:00Z",
    authorAddress: "0x1111111111111111111111111111111111111111",
    createdAt: "2026-07-03T08:00:00Z",
    updatedAt: "2026-07-19T08:14:02.311Z",
    tags: ["Food production"],
    vouchers: [
      {
        id: "22",
        chainId: 42220,
        address: "0x2222222222222222222222222222222222222222",
        name: "Kiriba",
        symbol: "KCH",
      },
    ],
    images: [
      reportImage("https://content.example/one.jpg", { width: 800, height: 600 }),
      reportImage("https://content.example/two.jpg"),
      reportImage("https://content.example/three.jpg"),
    ],
    attachments: [],
    body: "",
    hostName: "Patricia Makau",
    participants: "7",
    timeTaken: "1 Hour",
    status: null,
    ...overrides,
  };
}

beforeEach(() => {
  mocks.openDefaultMaps.mockReset();
  mocks.useReportLocation.mockReset();
  mocks.location = {
    data: {
      locationName: "Mathira, Nyeri, Kenya",
      country: "KE",
    },
  };
  mocks.auth = { isAuthenticated: false, address: undefined };
  mocks.detail = { data: detail(), isPending: false, isError: false, refetch: vi.fn() };
});

describe("ReportPage", () => {
  it("shows every image in a carousel with a position counter", () => {
    const { container } = render(<ReportPage reportId="3182" />);

    const carousel = container.querySelector('[data-slot="carousel"]');
    expect(carousel).toBeTruthy();
    expect(container.querySelectorAll('[data-slot="carousel-item"]')).toHaveLength(3);
    expect(within(carousel as HTMLElement).getByText("1 / 3")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Previous image" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next image" })).toBeTruthy();
  });

  it("loads only the first slide eagerly and prioritizes it", () => {
    const { container } = render(<ReportPage reportId="3182" />);

    const images = Array.from(container.querySelectorAll('[data-slot="carousel-item"] img'));
    expect(images.map((image) => image.getAttribute("loading"))).toEqual(["eager", "lazy", "lazy"]);
    expect(images.map((image) => image.getAttribute("fetchpriority"))).toEqual([
      "high",
      "auto",
      "auto",
    ]);
    expect(images.map((image) => image.getAttribute("alt"))).toEqual([
      "Harvesting greengrams",
      "Harvesting greengrams",
      "Harvesting greengrams",
    ]);
  });

  it("renders a single image as a plain frame with no inert controls", () => {
    mocks.detail.data = detail({
      images: [reportImage("https://content.example/only.jpg")],
    });
    const { container } = render(<ReportPage reportId="3182" />);

    expect(container.querySelector('[data-slot="carousel"]')).toBeNull();
    expect(screen.queryByRole("button", { name: "Next image" })).toBeNull();
    expect(container.querySelector('img[src="https://content.example/only.jpg"]')).toBeTruthy();
  });

  it("opens the tapped image in a full-screen carousel at the same index", () => {
    render(<ReportPage reportId="3182" />);

    fireEvent.click(screen.getAllByRole("button", { name: "View image full screen" })[1]!);

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Report images" })).toBeTruthy();
    expect(within(dialog).getByText("2 / 3")).toBeTruthy();
    const fullScreenImages = within(dialog).getAllByAltText("Harvesting greengrams");
    expect(fullScreenImages).toHaveLength(3);
    expect(fullScreenImages.map((image) => image.getAttribute("loading"))).toEqual([
      "lazy",
      "eager",
      "lazy",
    ]);
    expect(within(dialog).getByRole("button", { name: "Close" })).toBeTruthy();
  });

  it("renders the description as readable article copy rather than another card", () => {
    render(<ReportPage reportId="3182" />);

    const description = screen.getByText("7 members helped Patricia Makau harvest greengrams.");
    expect(description.tagName).toBe("P");
    expect(description.className).toContain("text-[0.9375rem]");
    expect(description.className).not.toContain("bg-card");
  });

  // Description is feed copy, so it stays a plain paragraph; only `body` is
  // markdown, and only 310 of the imported reports have one.
  it("renders the markdown body after the description", () => {
    mocks.detail.data = detail({
      body: "## What happened\n\nSee the [ledger](https://ledger.example/august).",
    });
    render(<ReportPage reportId="3182" />);

    const heading = screen.getByText("What happened");
    expect(heading.tagName).toBe("H3");
    expect(screen.getByRole("link", { name: "ledger" }).getAttribute("rel")).toBe(
      "noopener noreferrer",
    );
  });

  it("renders no body section when the report has no prose", () => {
    render(<ReportPage reportId="3182" />);
    expect(screen.queryByText("What happened")).toBeNull();
  });

  it("lists links with their kind, label and size", () => {
    mocks.detail.data = detail({
      attachments: [
        {
          kind: "FILE",
          url: "https://content.example/harvest-notes.pdf",
          filename: "harvest-notes.pdf",
          byteSize: 81_920,
        },
        // No filename, so the host is the label: a bare CDN path says nothing
        // and would not fit at 360px.
        { kind: "EMBED", url: "https://player.example/clip/9", filename: null, byteSize: null },
      ],
    });
    render(<ReportPage reportId="3182" />);

    const file = screen.getByRole("link", { name: /harvest-notes\.pdf/ });
    expect(file.getAttribute("href")).toBe("https://content.example/harvest-notes.pdf");
    expect(file.getAttribute("rel")).toBe("noopener noreferrer");
    expect(file.textContent).toContain("File · 80 KB");

    const embed = screen.getByRole("link", { name: /player\.example/ });
    expect(embed.textContent).toContain("Link");
    expect(embed.textContent).not.toContain("·");
  });

  it("renders no links section when the report has none", () => {
    render(<ReportPage reportId="3182" />);
    expect(screen.queryByText("Links")).toBeNull();
  });

  it("offers the author an edit shortcut at the top of their post", () => {
    mocks.auth = {
      isAuthenticated: true,
      address: "0x1111111111111111111111111111111111111111",
    };
    render(<ReportPage reportId="3182" />);

    expect(screen.getByRole("link", { name: "Edit" }).getAttribute("href")).toBe(
      "/posts/3182/edit",
    );
  });

  it("does not show the edit shortcut to another reader", () => {
    mocks.auth = {
      isAuthenticated: true,
      address: "0x2222222222222222222222222222222222222222",
    };
    render(<ReportPage reportId="3182" />);

    expect(screen.queryByRole("link", { name: "Edit" })).toBeNull();
  });

  it("separates report details from header metadata and provenance", () => {
    render(<ReportPage reportId="3182" />);

    const row = (label: string) => screen.getByText(label).parentElement?.textContent ?? "";
    expect(row("Report period")).toContain("2026");
    expect(row("Host")).toContain("Patricia Makau");
    expect(row("Participants")).toContain("7");
    // Issuer free text, shown verbatim rather than parsed into a duration.
    expect(row("Duration")).toContain("1 Hour");
    expect(row("Author")).toContain("0x1111");
    expect(row("Created")).toContain("2026");
    expect(row("Updated")).toContain("2026");
    expect(screen.getByRole("heading", { name: "Report details" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Report provenance" })).toBeTruthy();
  });

  it("collapses a single-day period to one date", () => {
    mocks.detail.data = detail({
      periodFrom: "2026-07-01T06:00:00Z",
      periodTo: "2026-07-01T18:00:00Z",
    });
    render(<ReportPage reportId="3182" />);

    expect(screen.getByText("Report period").parentElement?.textContent).not.toContain("–");
  });

  it("omits form facts the report never carried", () => {
    mocks.detail.data = detail({ hostName: null, participants: null, timeTaken: null });
    render(<ReportPage reportId="3182" />);

    expect(screen.queryByText("Host")).toBeNull();
    expect(screen.queryByText("Participants")).toBeNull();
    expect(screen.queryByText("Duration")).toBeNull();
    // The author row is unconditional, so the card never renders empty.
    expect(screen.getByText("Author")).toBeTruthy();
  });

  it("opens each related voucher's card over the post", () => {
    voucherSheet.open.mockClear();
    render(<ReportPage reportId="3182" />);

    const voucher = screen.getByRole("button", { name: /Kiriba/ });
    expect(voucher.textContent).toContain("KCH");
    fireEvent.click(voucher);

    expect(voucherSheet.open).toHaveBeenCalledWith("0x2222222222222222222222222222222222222222");
  });

  it("reverse-geocodes the coordinates for the header, location panel, and Maps label", () => {
    render(<ReportPage reportId="3182" />);

    expect(mocks.useReportLocation).toHaveBeenCalledWith(-1.29, 36.82);
    expect(screen.getAllByText("Mathira, Nyeri, Kenya")).toHaveLength(2);
    expect(screen.queryByText("Kitui, KEN")).toBeNull();
    expect(screen.getByRole("heading", { name: "Location" })).toBeTruthy();
    const map = screen.getByTestId("location-map");
    expect(map.getAttribute("data-lat")).toBe("-1.29");

    fireEvent.click(screen.getByRole("button", { name: /Open in Maps/ }));
    expect(mocks.openDefaultMaps).toHaveBeenCalledWith({
      label: "Mathira, Nyeri, Kenya",
      lat: -1.29,
      lng: 36.82,
    });
  });

  it("falls back to the backend location name when reverse geocoding fails", () => {
    mocks.location = { data: null };
    render(<ReportPage reportId="3182" />);

    expect(screen.getAllByText("Kitui, KEN")).toHaveLength(2);
  });

  it("renders no gallery or map when the report has neither", () => {
    mocks.detail.data = detail({ images: [], lat: null, lng: null, locationName: null });
    const { container } = render(<ReportPage reportId="3182" />);

    expect(container.querySelector('[data-slot="carousel"]')).toBeNull();
    expect(screen.queryByTestId("location-map")).toBeNull();
  });

  it("contains long detail tags inside the mobile viewport", () => {
    mocks.detail.data = detail({ tags: ["A very long community-space classification"] });
    render(<ReportPage reportId="3182" />);

    const tag = screen.getByText("A very long community-space classification");
    expect(tag.className).toContain("truncate");
    expect(tag.parentElement?.className).toContain("max-w-full");
    expect(tag.parentElement?.className).toContain("overflow-hidden");
  });

  it("uses a layout-matching skeleton while the post is loading", () => {
    mocks.detail = { data: undefined, isPending: true, isError: false, refetch: vi.fn() };
    const { container } = render(<ReportPage reportId="3182" />);

    expect(screen.getByLabelText("Loading post…").getAttribute("aria-busy")).toBe("true");
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(6);
  });

  it("offers a retry when the report fails to load", () => {
    const refetch = vi.fn();
    mocks.detail = { data: undefined, isPending: false, isError: true, refetch };
    render(<ReportPage reportId="3182" />);

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledOnce();
  });
});
