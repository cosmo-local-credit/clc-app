import { isRedirect } from "@tanstack/react-router";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("#/components/nearby-catalog", () => ({ NearbyCatalog: () => null }));
vi.mock("#/features/catalogs/ui/catalogs-page", () => ({ CatalogsPage: () => null }));
vi.mock("#/features/home/ui/market-list-page", () => ({ MarketListPage: () => null }));
vi.mock("#/features/home/ui/marketplace-page", () => ({ MarketplacePage: () => null }));
vi.mock("#/features/home/ui/offers-page", () => ({ OffersPage: () => null }));
vi.mock("#/features/pools/ui", () => ({ PoolDetailPage: () => null, PoolsPage: () => null }));

import { Route as HomeRoute } from "./_nav/index";
import { Route as MarketRoute } from "./_nav/market/index";
import { Route as PoolRoute } from "./_nav/pools/$poolAddress/index";
import { Route as PostRoute } from "./_nav/posts/$reportId/index";
import { Route as WalletVouchersRoute } from "./_nav/wallet/vouchers";

const VOUCHER = "0x2222222222222222222222222222222222222222";
const POOL = "0x1111111111111111111111111111111111111111";

type BeforeLoad = (context: {
  params: Record<string, string>;
  search: Record<string, unknown>;
}) => void;
type ValidateSearch = (search: Record<string, unknown>) => Record<string, unknown>;

function validateMarketSearch(search: Record<string, unknown>) {
  const validate = MarketRoute.options.validateSearch as unknown as ValidateSearch;
  return validate(search);
}

function redirectOptions(run: () => void) {
  try {
    run();
    expect.unreachable("expected a redirect");
  } catch (error) {
    expect(isRedirect(error)).toBe(true);
    return (error as { options: Record<string, unknown> }).options;
  }
}

describe("legacy non-map voucher sheet links", () => {
  it("keeps map voucher links in the sheet", () => {
    const beforeLoad = HomeRoute.options.beforeLoad as unknown as BeforeLoad;
    expect(() =>
      beforeLoad({
        params: {},
        search: { tab: "market", view: "map", voucher: VOUCHER },
      }),
    ).not.toThrow();
  });

  it("redirects an old Wallet card link to the canonical voucher page", () => {
    const beforeLoad = HomeRoute.options.beforeLoad as unknown as BeforeLoad;
    expect(
      redirectOptions(() =>
        beforeLoad({
          params: {},
          search: { tab: "wallet", view: "map", voucher: VOUCHER },
        }),
      ),
    ).toMatchObject({
      to: "/vouchers/$voucherAddress",
      params: { voucherAddress: VOUCHER },
      search: { from: "wallet" },
      replace: true,
    });
  });

  it("redirects a legacy Marketplace list card to the canonical voucher page", () => {
    const beforeLoad = MarketRoute.options.beforeLoad as unknown as BeforeLoad;
    expect(
      redirectOptions(() =>
        beforeLoad({
          params: {},
          search: validateMarketSearch({ scope: "vouchers", q: "food", voucher: VOUCHER }),
        }),
      ),
    ).toMatchObject({
      to: "/vouchers/$voucherAddress",
      params: { voucherAddress: VOUCHER },
      search: { from: "market" },
      replace: true,
    });
  });

  it("removes a malformed legacy Marketplace voucher and preserves its filters", () => {
    const beforeLoad = MarketRoute.options.beforeLoad as unknown as BeforeLoad;
    expect(validateMarketSearch({ scope: "vouchers", q: "food" })).toEqual({
      scope: "vouchers",
      q: "food",
    });
    expect(validateMarketSearch({ scope: "vouchers", q: "food", voucher: undefined })).toEqual({
      scope: "vouchers",
      q: "food",
    });
    const search = validateMarketSearch({
      scope: "vouchers",
      q: "food",
      voucher: [VOUCHER, VOUCHER],
    });
    expect(search.voucher).toBe("__invalid__");
    expect(redirectOptions(() => beforeLoad({ params: {}, search }))).toMatchObject({
      to: "/market",
      search: { scope: "vouchers", q: "food" },
      replace: true,
    });
  });

  it("removes a valid legacy voucher from home tabs without a voucher origin", () => {
    const beforeLoad = HomeRoute.options.beforeLoad as unknown as BeforeLoad;
    expect(
      redirectOptions(() =>
        beforeLoad({
          params: {},
          search: { tab: "settings", view: "map", voucher: VOUCHER },
        }),
      ),
    ).toMatchObject({
      to: "/",
      search: { tab: "settings", view: "map", voucher: undefined },
      replace: true,
    });
  });

  it("redirects old pool, voucher-list, and Post card links with their origins", () => {
    const poolBeforeLoad = PoolRoute.options.beforeLoad as unknown as BeforeLoad;
    expect(
      redirectOptions(() =>
        poolBeforeLoad({ params: { poolAddress: POOL }, search: { voucher: VOUCHER } }),
      ),
    ).toMatchObject({
      params: { voucherAddress: VOUCHER },
      search: { poolAddress: POOL },
      replace: true,
    });

    const walletBeforeLoad = WalletVouchersRoute.options.beforeLoad as unknown as BeforeLoad;
    expect(
      redirectOptions(() => walletBeforeLoad({ params: {}, search: { voucher: VOUCHER } })),
    ).toMatchObject({
      params: { voucherAddress: VOUCHER },
      search: { from: "vouchers" },
      replace: true,
    });

    const postBeforeLoad = PostRoute.options.beforeLoad as unknown as BeforeLoad;
    expect(
      redirectOptions(() =>
        postBeforeLoad({ params: { reportId: "3182" }, search: { voucher: VOUCHER } }),
      ),
    ).toMatchObject({
      params: { voucherAddress: VOUCHER },
      search: { from: "posts", reportId: "3182" },
      replace: true,
    });
  });

  it("removes malformed pool and Post voucher parameters without losing route state", () => {
    const poolBeforeLoad = PoolRoute.options.beforeLoad as unknown as BeforeLoad;
    expect(
      redirectOptions(() =>
        poolBeforeLoad({
          params: { poolAddress: POOL },
          search: { tab: "holdings", voucher: "not-an-address" },
        }),
      ),
    ).toMatchObject({
      to: "/pools/$poolAddress",
      params: { poolAddress: POOL },
      search: { tab: "holdings" },
      replace: true,
    });

    const postBeforeLoad = PostRoute.options.beforeLoad as unknown as BeforeLoad;
    expect(
      redirectOptions(() =>
        postBeforeLoad({
          params: { reportId: "3182" },
          search: { voucher: "not-an-address" },
        }),
      ),
    ).toMatchObject({
      to: "/posts/$reportId",
      params: { reportId: "3182" },
      search: {},
      replace: true,
    });
  });

  it("removes a malformed Wallet voucher instead of opening a sheet", () => {
    const beforeLoad = WalletVouchersRoute.options.beforeLoad as unknown as BeforeLoad;
    expect(
      redirectOptions(() => beforeLoad({ params: {}, search: { voucher: "not-an-address" } })),
    ).toMatchObject({ to: "/wallet/vouchers", search: {}, replace: true });
  });
});

describe("a market without a list", () => {
  it.each([{}, { scope: "everything" }])(
    "sends /market without a list to the map, keeping the search: %o",
    (extra) => {
      const beforeLoad = MarketRoute.options.beforeLoad as unknown as BeforeLoad;
      const search = validateMarketSearch({
        ...extra,
        q: "food",
        tags: "Repair",
        creditable: "true",
        out_voucher: POOL,
      });
      const options = redirectOptions(() => beforeLoad({ params: {}, search }));
      expect(options).toMatchObject({ to: "/", replace: true });
      expect(options.search).toEqual({
        q: "food",
        tags: "Repair",
        tagMatch: undefined,
        creditable: "true",
      });
    },
  );

  it.each(["offers", "all"])("keeps the %s list where it is", (scope) => {
    const beforeLoad = MarketRoute.options.beforeLoad as unknown as BeforeLoad;
    expect(() =>
      beforeLoad({ params: {}, search: validateMarketSearch({ scope, q: "food" }) }),
    ).not.toThrow();
  });

  it("sends the retired list view of the map to the map", () => {
    const beforeLoad = HomeRoute.options.beforeLoad as unknown as BeforeLoad;
    expect(
      redirectOptions(() =>
        beforeLoad({ params: {}, search: { tab: "market", view: "list", q: "food" } }),
      ),
    ).toMatchObject({ to: "/", search: { tab: "market", view: undefined, q: "food" } });
  });
});

describe("Activity search canonicalization", () => {
  it("replaces malformed Activity state with its canonical values", () => {
    const beforeLoad = HomeRoute.options.beforeLoad as unknown as BeforeLoad;

    expect(
      redirectOptions(() =>
        beforeLoad({
          params: {},
          search: {
            tab: "activity",
            view: "map",
            activityQ: "  market   voucher  ",
            activityTypes: ["SWAPPED,sent", "sent"],
          },
        }),
      ),
    ).toMatchObject({
      to: "/",
      search: {
        tab: "activity",
        view: "map",
        activityQ: "market voucher",
        activityTypes: "sent,swapped",
      },
      replace: true,
    });
  });

  it("removes Activity-only filters after navigating to another home tab", () => {
    const beforeLoad = HomeRoute.options.beforeLoad as unknown as BeforeLoad;

    expect(
      redirectOptions(() =>
        beforeLoad({
          params: {},
          search: {
            tab: "posts",
            view: "map",
            activityQ: "market voucher",
            activityTypes: "sent",
          },
        }),
      ),
    ).toMatchObject({
      to: "/",
      search: {
        tab: "posts",
        view: "map",
        activityQ: undefined,
        activityTypes: undefined,
      },
      replace: true,
    });
  });
});
