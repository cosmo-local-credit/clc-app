import type { Offering } from "@clc/api/features/offerings/client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    search: _search,
    children,
    ...props
  }: {
    to: string;
    params: Record<string, string>;
    search?: unknown;
    children: ReactNode;
  }) => (
    <a
      href={Object.entries(params).reduce(
        (path, [key, value]) => path.replace(`$${key}`, value),
        to,
      )}
      {...props}
    >
      {children}
    </a>
  ),
}));

import { OfferingsPanel } from "./offerings-panel";

const offering: Offering = {
  id: "7",
  sourceId: null,
  voucherId: "3",
  voucherAddress: "0x1111111111111111111111111111111111111111",
  voucherName: "Kilifi Food Voucher",
  voucherSymbol: "KFV",
  voucherUoa: "KES",
  priceInUnitOfAccount: "250",
  voucherDecimals: 6,
  voucherImageUrl: "https://content.example/voucher.webp",
  voucherLocationName: "Kilifi",
  voucherGeoLat: -3.63,
  voucherGeoLng: 39.85,
  sellerAddress: "0x2222222222222222222222222222222222222222",
  name: "Fresh maize",
  description: "One bag",
  quantity: "1",
  unit: "bag",
  unitLabel: "bag",
  frequency: null,
  pricePerUnit: "250",
  available: true,
  locationName: null,
  geoLat: null,
  geoLng: null,
  effectiveLocationName: "Kilifi Market",
  effectiveGeoLat: -3.63,
  effectiveGeoLng: 39.85,
  distanceMeters: 1_200,
  imageUrl: null,
  tags: ["food"],
};

function queryFor(row: Offering) {
  return {
    data: { pages: [{ offerings: [row] }] },
    isPending: false,
    isError: false,
    isSuccess: true,
    hasNextPage: false,
    isFetching: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  };
}

describe("OfferingsPanel discovery mode", () => {
  it("links the whole tile directly to its voucher and shows discovery metadata", () => {
    const { container } = render(
      <OfferingsPanel
        query={queryFor(offering)}
        emptyState="No offers"
        showVoucher
        showVoucherName
        showLocation
        directNavigation
      />,
    );

    const link = screen.getByRole("link", { name: "Open voucher for Fresh maize" });
    expect(link.getAttribute("href")).toBe("/vouchers/0x1111111111111111111111111111111111111111");
    expect(screen.getByText("Kilifi Food Voucher · KFV")).toBeTruthy();
    expect(screen.getByText("250 KES / bag")).toBeTruthy();
    expect(screen.getByText("Kilifi Market · 1.2 km")).toBeTruthy();
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "https://content.example/voucher.webp",
    );
    expect(screen.queryByRole("button", { name: /view offering details/i })).toBeNull();
  });

  it("distinguishes an unavailable UoA conversion from an unpriced offering", () => {
    const { rerender } = render(
      <OfferingsPanel
        query={queryFor({ ...offering, voucherUoa: null, priceInUnitOfAccount: null })}
        emptyState="No offers"
        directNavigation
      />,
    );
    expect(screen.getByText("Price unavailable")).toBeTruthy();

    rerender(
      <OfferingsPanel
        query={queryFor({ ...offering, pricePerUnit: null, priceInUnitOfAccount: null })}
        emptyState="No offers"
        directNavigation
      />,
    );
    expect(screen.getByText("Price on request")).toBeTruthy();
  });

  it("localizes an exact UoA decimal without converting it to Number", () => {
    render(
      <OfferingsPanel
        query={queryFor({
          ...offering,
          priceInUnitOfAccount: "9007199254740993.25",
          unit: "dozen",
          unitLabel: "dozen",
        })}
        emptyState="No offers"
        directNavigation
      />,
    );
    expect(screen.getByText("9,007,199,254,740,993.25 KES / dozen")).toBeTruthy();
  });

  it("prefers an offering thumbnail over the parent voucher image", () => {
    const { container } = render(
      <OfferingsPanel
        query={queryFor({ ...offering, imageUrl: "https://content.example/offering.webp" })}
        emptyState="No offers"
        directNavigation
      />,
    );

    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "https://content.example/offering.webp",
    );
  });

  it("fetches the next page only after an explicit manual Load more", async () => {
    const fetchNextPage = vi.fn().mockResolvedValue(undefined);
    render(
      <OfferingsPanel
        query={{
          ...queryFor(offering),
          hasNextPage: true,
          fetchNextPage,
        }}
        emptyState="No offers"
        manualPageSize={1}
        autoLoadMore={false}
        directNavigation
      />,
    );

    expect(fetchNextPage).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(fetchNextPage).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.getByRole("button", { name: "Load more" })).toBeTruthy());
  });

  it("falls back to initials when an image fails in the offering rollup", () => {
    render(
      <OfferingsPanel
        query={queryFor({ ...offering, imageUrl: "https://content.example/broken.webp" })}
        emptyState="No offers"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "View offering details: Fresh maize" }));
    const dialog = screen.getByRole("dialog");
    const images = dialog.querySelectorAll("img");
    expect(images.length).toBeGreaterThan(0);
    fireEvent.error(images[0]!);
    expect(screen.getAllByText("FM").length).toBeGreaterThan(0);
  });
});
