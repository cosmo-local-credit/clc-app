import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { renderInShell } from "#/desktop/shell/-shell-test-router";
import type * as VoucherSectionBits from "./detail/voucher-section-bits";

const ADDRESS = "0x2222222222222222222222222222222222222222" as const;
const state = vi.hoisted(() => ({
  hasDetail: true,
  displaySymbol: undefined as string | null | undefined,
  legacySymbol: undefined as string | undefined,
  wants: [] as {
    id: string;
    name: string;
    locationName: string;
    tags: string[];
    imageUrl: null;
    markerIcon: "question";
    markerColor: "orange";
    state: "active";
  }[],
}));

vi.mock("wagmi", () => ({ useConnection: () => ({ address: undefined }) }));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({ state: "guest", isAuthenticated: false, isLoading: false }),
}));
vi.mock("#/features/wallet/hooks/use-account-balances", () => ({
  useAllAccountTokens: () => ({ tokens: [], isPending: false }),
}));
vi.mock("#/features/pools/hooks/use-pool-vouchers", () => ({
  usePoolVouchersInfinite: () => ({ data: undefined, isPending: false }),
}));
vi.mock("#/features/home/hooks/use-market-voucher-detail", () => ({
  useMarketVoucherDetail: () => ({
    data: state.hasDetail
      ? {
          id: "8",
          address: "0x2222222222222222222222222222222222222222",
          name: "Community voucher",
          symbol: "COM",
          displaySymbol: state.displaySymbol,
          legacySymbol: state.legacySymbol,
          chainId: 100,
          ownerAddress: "0x1111111111111111111111111111111111111111",
          active: true,
          tags: [],
          lat: null,
          lng: null,
          decimals: 6,
        }
      : undefined,
    isPending: false,
    isError: false,
  }),
}));
vi.mock("#/features/ownership/hooks/use-asset-owner", () => ({
  useAssetOwner: (_address: string, owner: string | null) => owner,
}));
vi.mock("#/features/home/hooks/use-discovery-distance-origin", () => ({
  useDiscoveryDistanceOrigin: () => null,
}));
vi.mock("#/components/vouchers/voucher-summary", () => ({
  useVoucherBalanceSummary: () => ({ status: "hidden", hasPositiveBalance: false }),
}));
vi.mock("#/components/wallet", () => ({ VoucherAvatar: () => null, WALLET_TOKEN_BY_ID: {} }));
vi.mock("#/components/messaging/resource-owner-contact", () => ({
  ResourceMessageButton: () => null,
}));
vi.mock("#/desktop/vouchers/detail/voucher-actions", () => ({ VoucherActionCells: () => null }));
vi.mock("#/desktop/vouchers/detail/voucher-catalog-button", () => ({
  VoucherCatalogButton: () => null,
}));
vi.mock("#/desktop/vouchers/detail/voucher-info", () => ({
  useCanEditVoucher: () => ({ canEdit: false }),
  VoucherInfoDesk: () => <div>Voucher information</div>,
}));
vi.mock("#/desktop/vouchers/detail/voucher-offerings", () => ({
  VoucherOfferingsDesk: () => <h2>Offerings</h2>,
}));
vi.mock("#/desktop/vouchers/detail/voucher-posts", () => ({
  VoucherPostsDesk: () => <h2>Posts</h2>,
}));
vi.mock("#/desktop/vouchers/detail/voucher-reviews", () => ({
  VoucherReviewsDesk: () => <h2>Reviews</h2>,
}));
vi.mock("#/desktop/vouchers/detail/voucher-activity", () => ({
  VoucherActivityDesk: () => <h2>Activity</h2>,
}));
vi.mock("#/desktop/vouchers/detail/voucher-section-bits", async (importOriginal) => ({
  ...(await importOriginal<typeof VoucherSectionBits>()),
  VoucherBalanceLine: () => null,
  VoucherRatingLine: () => null,
  VoucherShareButton: () => null,
}));
vi.mock("#/features/wants/hooks/use-voucher-wants", () => ({
  useVoucherWants: () => ({
    wants: state.wants,
    query: { isSuccess: true, isPending: false, isError: false, hasNextPage: false },
  }),
}));

import { VoucherDesk } from "./voucher-desk";

beforeEach(() => {
  state.hasDetail = true;
  state.displaySymbol = undefined;
  state.legacySymbol = undefined;
  state.wants = [
    {
      id: "9",
      name: "Repair a wheel",
      locationName: "Kilifi",
      tags: [],
      imageUrl: null,
      markerIcon: "question",
      markerColor: "orange",
      state: "active",
    },
  ];
});

describe("Voucher desktop heading", () => {
  it("shows the saved display symbol beside the Voucher name", async () => {
    state.displaySymbol = "LOCAL";
    await renderInShell(<VoucherDesk voucherAddress={ADDRESS} />, `/vouchers/${ADDRESS}`);

    const heading = screen.getByRole("heading", { level: 1, name: "Community voucher LOCAL" });
    expect(within(heading).getByText("LOCAL").getAttribute("dir")).toBe("ltr");
  });

  it.each([null, undefined])(
    "shows the original ticker when the saved display symbol is %s",
    async (displaySymbol) => {
      state.displaySymbol = displaySymbol;
      state.legacySymbol = "COM";
      await renderInShell(<VoucherDesk voucherAddress={ADDRESS} />, `/vouchers/${ADDRESS}`);

      expect(screen.getByRole("heading", { level: 1, name: "Community voucher COM" })).toBeTruthy();
    },
  );

  it("keeps the fallback heading free of a ticker without Voucher detail", async () => {
    state.hasDetail = false;
    await renderInShell(<VoucherDesk voucherAddress={ADDRESS} />, `/vouchers/${ADDRESS}`);

    expect(screen.getByRole("heading", { level: 1, name: "Token" })).toBeTruthy();
  });
});

describe("Voucher desktop Wants section", () => {
  it("renders controller Wants immediately after Offerings and reports its completed count", async () => {
    await renderInShell(<VoucherDesk voucherAddress={ADDRESS} />, `/vouchers/${ADDRESS}`);
    const wants = screen.getByRole("region", { name: "Wants" });
    expect(wants.previousElementSibling?.getAttribute("aria-label")).toBe("Offerings");
    expect(
      within(wants)
        .getByRole("link", { name: /Repair a wheel/ })
        .getAttribute("href"),
    ).toBe("/wants/9");
    const nav = screen.getByRole("navigation", { name: "Voucher sections" });
    expect(await within(nav).findByRole("link", { name: "Wants 1" })).toBeTruthy();
    fireEvent.click(within(nav).getByRole("link", { name: "Wants 1" }));
    expect(document.activeElement).toBe(wants);
  });

  it("restores an explicit Wants section target from the resource URL", async () => {
    await renderInShell(<VoucherDesk voucherAddress={ADDRESS} />, `/vouchers/${ADDRESS}?tab=wants`);
    const wants = screen.getByRole("region", { name: "Wants" });
    await waitFor(() => expect(document.activeElement).toBe(wants));
    expect(screen.getByRole("link", { name: "Wants 1" }).getAttribute("aria-current")).toBe(
      "location",
    );
  });
});
