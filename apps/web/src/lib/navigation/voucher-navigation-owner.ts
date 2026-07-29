export type VoucherOrigin = "market" | "wallet" | "vouchers";

export type VoucherNavigationOwner = {
  activeTab: "market" | "wallet";
  backDestination: "market" | "pool" | "vouchers" | "wallet";
  to: string;
  search?: { tab: "wallet" };
};

export function resolveVoucherNavigationOwner({
  from,
  poolAddress,
}: {
  from?: VoucherOrigin;
  poolAddress?: string;
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
