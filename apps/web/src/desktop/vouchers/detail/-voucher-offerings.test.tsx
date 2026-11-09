import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

const manager = vi.hoisted(() => ({ isOwner: false }));
vi.mock("#/features/vouchers/hooks/use-voucher-offerings-manager", () => ({
  useVoucherOfferingsManager: () => ({
    isOwner: manager.isOwner,
    usage: { data: undefined, isPending: false, isError: false, isFetching: false },
    query: {
      data: { pages: [{ offerings: [] }] },
      isPending: false,
      isError: false,
      isSuccess: true,
      hasNextPage: false,
    },
    editor: null,
    setEditor: vi.fn(),
    canCreate: true,
    deletingID: null,
    requestDelete: vi.fn(),
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
