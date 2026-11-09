import type { ReportDetail } from "@clc/api/features/reports/client";
import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  page: {} as Record<string, unknown>,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    children,
    className,
  }: {
    to: string;
    params?: Record<string, string>;
    children: ReactNode;
    className?: string;
  }) => {
    const path = Object.entries(params ?? {}).reduce(
      (value, [key, replacement]) => value.replace(`$${key}`, replacement),
      to,
    );
    return (
      <a href={path} className={className}>
        {children}
      </a>
    );
  },
}));

vi.mock("#/features/home/hooks/use-report-page", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#/features/home/hooks/use-report-page")>()),
  useReportPage: () => mocks.page,
}));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({ isAuthenticated: true, isLoading: false, state: "authenticated" }),
}));
vi.mock("#/components/ui/location-map.lazy", () => ({
  LocationMap: () => <div data-testid="location-map" />,
}));

import { PostDesk } from "./post-desk";

const LONG_TITLE =
  "Harvesting-greengrams-with-the-Wendo-community-group-and-sharing-the-proceeds-between-members";
const LONG_PLACE =
  "Kitui Central Market Cooperative Society Building, Second Floor, Wendo Group Offices";
const LONG_VOUCHER = "Wendo Greengram Growers Community Harvest Voucher";
const LONG_FILE = "wendo-greengram-harvest-summary-and-proceeds-sharing-agreement-2026.pdf";

function detail(): ReportDetail {
  return {
    id: "3182",
    title: LONG_TITLE,
    description: "7 members helped Patricia Makau harvest greengrams on her plot.",
    body: "",
    imageUrl: null,
    locationName: LONG_PLACE,
    lat: -1.29,
    lng: 36.82,
    periodFrom: null,
    periodTo: null,
    createdAt: "2026-07-03T08:00:00Z",
    updatedAt: "2026-07-19T08:14:02.311Z",
    markerIcon: "post",
    markerColor: "pink",
    tags: [],
    vouchers: [
      {
        id: "22",
        chainId: 42220,
        address: "0x2222222222222222222222222222222222222222",
        name: LONG_VOUCHER,
        symbol: "WGGCH",
      },
    ],
    pools: [],
    images: [],
    attachments: [
      { kind: "FILE", url: "https://files.example/a.pdf", filename: LONG_FILE, byteSize: 2048 },
    ],
    hostName: null,
    participants: null,
    timeTaken: null,
    status: null,
  } as unknown as ReportDetail;
}

beforeEach(() => {
  mocks.page = {
    reportQuery: { isPending: false, isError: false, isFetching: false, refetch: vi.fn() },
    report: detail(),
    isAuthenticated: true,
    isAuthor: false,
    updated: "Jul 19, 2026",
    locationLabel: LONG_PLACE,
  };
});

/** The wrapping rule the review asks of a detail page: break inside a long word. */
const WRAPS = "[overflow-wrap:anywhere]";

describe("a post's detail page keeps what a reader came to verify", () => {
  it("wraps a long title instead of cutting it", () => {
    render(<PostDesk reportId="3182" />);

    const title = screen.getByRole("heading", { level: 1, name: LONG_TITLE });
    expect(title.parentElement?.className).toContain(WRAPS);
    expect(title.className).not.toContain("truncate");
  });

  it("wraps the description", () => {
    render(<PostDesk reportId="3182" />);

    const description = screen.getByText(/7 members helped Patricia Makau/);
    expect(description.className).toContain(WRAPS);
    expect(description.className).not.toContain("truncate");
  });

  it("wraps the place, the related voucher and the attached file's name, and keeps the ticker whole", () => {
    render(<PostDesk reportId="3182" />);

    // The place is in the meta line under the title and again in the Location section.
    const section = screen.getByRole("heading", { name: "Location" }).closest("section");
    const place = within(section as HTMLElement).getByText(LONG_PLACE);
    expect(place?.className).toContain(WRAPS);
    expect(place?.className).not.toContain("truncate");

    const voucher = screen.getByText(LONG_VOUCHER);
    expect(voucher.className).toContain(WRAPS);
    expect(voucher.className).not.toContain("truncate");
    const ticker = within(voucher.parentElement as HTMLElement).getByText("WGGCH");
    expect(ticker.className).not.toContain("truncate");
    expect(ticker.className).toContain("shrink-0");

    const file = screen.getByText(LONG_FILE);
    expect(file.className).toContain(WRAPS);
    expect(file.className).not.toContain("truncate");
  });
});
