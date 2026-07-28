import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { ReportSummary } from "#/features/home/api/reports-client";

const mocks = vi.hoisted(() => ({
  feed: {
    data: undefined as { pages: { reports: ReportSummary[] }[] } | undefined,
    isPending: false,
    isError: false,
    isSuccess: true,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  },
}));

vi.mock("#/features/home/hooks/use-reports", () => ({
  useReportsInfinite: () => mocks.feed,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    children,
    ...props
  }: {
    to: string;
    params?: Record<string, string>;
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
}));

import { PostsPage } from "./posts-page";

function report(overrides: Partial<ReportSummary> = {}): ReportSummary {
  return {
    id: "3182",
    title: "Harvesting greengrams with Wendo group",
    description: "7 members from Wendo group helped Patricia Makau harvest greengrams.",
    imageUrl: "https://content.example/harvest.jpg",
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
      { address: "0x2222222222222222222222222222222222222222", name: "Kiriba", symbol: "KCH" },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  mocks.feed = {
    data: { pages: [{ reports: [report()] }] },
    isPending: false,
    isError: false,
    isSuccess: true,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  };
});

describe("PostsPage", () => {
  it("renders a report as a list row linking to its own page", () => {
    render(<PostsPage />);

    expect(screen.getByRole("heading", { name: "Posts" })).toBeTruthy();
    const row = screen.getByRole("link");
    expect(row.getAttribute("href")).toBe("/posts/3182");
    expect(within(row).getByText("Harvesting greengrams with Wendo group")).toBeTruthy();
    expect(within(row).getByText(/7 members from Wendo group/)).toBeTruthy();
    expect(within(row).getByText("Food production")).toBeTruthy();
    expect(within(row).getByText("KCH")).toBeTruthy();
    // The placeholder screen is gone.
    expect(screen.queryByText(/impact reports/i)).toBeNull();
  });

  it("shows the updated date instead of the author address", () => {
    render(<PostsPage />);

    const row = screen.getByRole("link");
    const time = row.querySelector("time");
    expect(time?.getAttribute("datetime")).toBe("2026-07-19T08:14:02.311Z");
    expect(time?.textContent).toContain("2026");
    expect(row.textContent).not.toContain("0x1111");
    // created_at is not a feed timestamp.
    expect(screen.queryByText(/Jul 3, 2026/)).toBeNull();
  });

  it("limits the title and description to one line", () => {
    render(<PostsPage />);

    expect(screen.getByText("Harvesting greengrams with Wendo group").className).toContain(
      "line-clamp-1",
    );
    expect(screen.getByText(/7 members from Wendo group/).className).toContain("line-clamp-1");
  });

  it("contains long tag labels and vertically aligns the date metadata", () => {
    mocks.feed.data = {
      pages: [{ reports: [report({ tags: ["Common Space", "Construction", "Care"] })] }],
    };
    render(<PostsPage />);

    const tagLabel = screen.getByText("Common Space");
    expect(tagLabel.className).toContain("block");
    expect(tagLabel.className).toContain("truncate");
    expect(tagLabel.parentElement?.className).toContain("overflow-hidden");

    const time = screen.getByRole("link").querySelector("time");
    const metadataRow = time?.parentElement;
    const voucher = screen.getByText("KCH");
    expect(metadataRow?.className).toContain("h-5");
    expect(time?.className).toContain("h-full");
    expect(time?.className).toContain("items-center");
    expect(time?.className).toContain("text-xs");
    expect(voucher.parentElement?.className).toContain("h-full");
    expect(voucher.className).toContain("h-full");
  });

  it("lazy-loads the main image so a page of rows costs no bytes up front", () => {
    const { container } = render(<PostsPage />);

    const image = container.querySelector('img[src="https://content.example/harvest.jpg"]');
    expect(image?.getAttribute("loading")).toBe("lazy");
  });

  it("falls back to a seeded monogram when a report has no image", () => {
    mocks.feed.data = { pages: [{ reports: [report({ imageUrl: null })] }] };
    const { container } = render(<PostsPage />);

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("link").textContent).toContain("H");
  });

  it("caps tags and vouchers so a row cannot grow unbounded", () => {
    mocks.feed.data = {
      pages: [
        {
          reports: [
            report({
              tags: ["Education", "Care", "Culture", "Art"],
              vouchers: [
                { address: "0x1", name: "One", symbol: "ONE" },
                { address: "0x2", name: "Two", symbol: "TWO" },
                { address: "0x3", name: "Three", symbol: "THREE" },
              ],
            }),
          ],
        },
      ],
    };
    render(<PostsPage />);

    const row = screen.getByRole("link");
    expect(within(row).getByText("Education")).toBeTruthy();
    expect(within(row).getByText("Care")).toBeTruthy();
    expect(within(row).queryByText("Culture")).toBeNull();
    expect(within(row).getByText("+2")).toBeTruthy();
    const voucher = within(row).getByText("ONE");
    expect(voucher.className).toContain("border-border");
    expect(voucher.className).toContain("bg-card");
    expect(within(row).queryByText("TWO")).toBeNull();
    expect(within(row).queryByText("THREE")).toBeNull();
    expect(within(row).getByText("2+")).toBeTruthy();
  });

  it("offers a retry when the feed fails", () => {
    const refetch = vi.fn();
    mocks.feed = { ...mocks.feed, data: undefined, isError: true, isSuccess: false, refetch };
    render(<PostsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("shows an empty state rather than an error when there are no posts", () => {
    mocks.feed.data = { pages: [{ reports: [] }] };
    render(<PostsPage />);

    expect(screen.getByText("No posts yet")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
