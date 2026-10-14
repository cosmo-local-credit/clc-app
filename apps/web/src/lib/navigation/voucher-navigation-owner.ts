import type { HomeTab } from "#/lib/navigation/home-tabs";

export type VoucherOrigin = "market" | "posts" | "wallet" | "vouchers";

export type VoucherNavigationOwner = {
  activeTab: HomeTab;
  backDestination: "market" | "pool" | "posts" | "vouchers" | "wallet";
  to: string;
  search?: { tab: "posts" | "wallet" };
};

export function resolveVoucherNavigationOwner({
  from,
  poolAddress,
  reportId,
}: {
  from?: VoucherOrigin;
  poolAddress?: string;
  reportId?: string;
}): VoucherNavigationOwner {
  if (poolAddress) {
    return {
      activeTab: "wallet",
      backDestination: "pool",
      to: `/pools/${poolAddress}`,
    };
  }

  if (from === "wallet") {
    return {
      activeTab: "wallet",
      backDestination: "wallet",
      to: "/",
      search: { tab: "wallet" },
    };
  }

  if (from === "posts") {
    return reportId
      ? {
          activeTab: "posts",
          backDestination: "posts",
          to: `/posts/${reportId}`,
        }
      : {
          activeTab: "posts",
          backDestination: "posts",
          to: "/",
          search: { tab: "posts" },
        };
  }

  if (from === "vouchers") {
    return {
      activeTab: "wallet",
      backDestination: "vouchers",
      to: "/wallet/vouchers",
    };
  }

  return {
    activeTab: "market",
    backDestination: "market",
    to: "/",
  };
}
