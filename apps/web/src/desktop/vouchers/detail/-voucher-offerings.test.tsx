import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Offering } from "@clc/api/features/offerings/client";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const manager = vi.hoisted(() => ({
  isOwner: false,
  canEdit: false,
  offerings: [] as Offering[],
  setEditor: vi.fn(),
  requestDelete: vi.fn(),
}));
vi.mock("#/features/vouchers/hooks/use-voucher-offerings-manager", () => ({
  useVoucherOfferingsManager: () => ({
    isOwner: manager.isOwner,
    canEdit: manager.isOwner || manager.canEdit,
    usage: { data: undefined, isPending: false, isError: false, isFetching: false },
    query: {
      data: { pages: [{ offerings: manager.offerings }] },
      isPending: false,
      isError: false,
      isSuccess: true,
      hasNextPage: false,
    },
    editor: null,
    setEditor: manager.setEditor,
    canCreate: true,
    deletingID: null,
    requestDelete: manager.requestDelete,
  }),
}));

vi.mock("#/hooks/use-resource-usage", () => ({
  useResourceUsage: (enabled: boolean) => ({
    data: enabled
      ? { offers: { used: 2, limit: 5, unlimited: false, canCreate: true } }
      : undefined,
    isPending: !enabled,
    isError: false,
  }),
}));

import { VoucherOfferingsDesk } from "./voucher-offerings";

beforeEach(() => {
  manager.canEdit = false;
  manager.offerings = [];
  manager.setEditor.mockReset();
  manager.requestDelete.mockReset();
});

function offering(): Offering {
  return {
    id: "7",
    sourceId: null,
    voucherId: "8",
    voucherAddress: "0x2222222222222222222222222222222222222222",
    sellerAddress: "0x1111111111111111111111111111111111111111",
    voucherName: "Community voucher",
    voucherSymbol: "MALII",
    voucherUoa: "KES",
    priceInUnitOfAccount: "25",
    voucherDecimals: 6,
    name: "Bicycle repair",
    description: "Fix a puncture",
    quantity: "1",
    unit: "hour",
    unitLabel: "hour",
    frequency: null,
    pricePerUnit: "25",
    available: true,
    locationName: null,
    geoLat: null,
    geoLng: null,
    imageUrl: null,
    tags: ["Repair"],
  };
}

function renderEmpty(isOwner: boolean, canEditDetails = false) {
  manager.isOwner = isOwner;
  render(
    <QueryClientProvider client={new QueryClient()}>
      <VoucherOfferingsDesk
        address="0x2222222222222222222222222222222222222222"
        symbol="MALII"
        voucherValue="10"
        voucherUoa="KES"
        ownerAddress="0x1111111111111111111111111111111111111111"
        canEditDetails={canEditDetails}
        layout="page"
      />
    </QueryClientProvider>,
  );
}

describe("a voucher with no offerings", () => {
  it("tells its issuer what an offering does", () => {
    renderEmpty(true);
    expect(
      screen.getByText("Add what you accept this voucher for, and it appears in the marketplace."),
    ).toBeTruthy();
  });

  it("tells anyone else there is nothing to exchange for yet", () => {
    renderEmpty(false);
    expect(
      screen.getByText("There is nothing available for exchange with this voucher yet."),
    ).toBeTruthy();
  });
});

describe("the offerings quota", () => {
  it("shows to an admin or manager who can edit, as the phone's Offerings title does", () => {
    renderEmpty(false, true);
    expect(screen.getByText(/2.*5/)).toBeTruthy();
  });

  it("stays hidden from a visitor", () => {
    renderEmpty(false, false);
    expect(screen.queryByText(/2.*5/)).toBeNull();
  });
});

describe("desktop Offering management", () => {
  it("lets an Admin edit an existing Offer while keeping owner-only Add and Remove absent", () => {
    const row = offering();
    manager.offerings = [row];
    manager.canEdit = true;
    renderEmpty(false, true);
    expect(
      screen.getByRole("button", { name: "View offering details: Bicycle repair" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add offering" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(manager.setEditor).toHaveBeenCalledWith({ kind: "edit", offering: row });
  });

  it("preserves owner editing and removal for the exact selected Offer", () => {
    const row = offering();
    manager.offerings = [row];
    renderEmpty(true);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(manager.setEditor).toHaveBeenCalledWith({ kind: "edit", offering: row });
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(manager.requestDelete).toHaveBeenCalledWith(row);
    expect(screen.getByRole("button", { name: "Add offering" })).toBeTruthy();
  });

  it("keeps populated Offers readable without giving a visitor management actions", () => {
    manager.offerings = [offering()];
    renderEmpty(false);
    expect(
      screen.getByRole("button", { name: "View offering details: Bicycle repair" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
  });
});
