import { Outlet, useMatches, useSearch } from "@tanstack/react-router";
import type { CSSProperties } from "react";

import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { type HomeTab, isAtHomeTabRoot, parseHomeTab } from "#/lib/navigation/home-tabs";
import type { NavOwner } from "#/lib/navigation/navigation-owner";
import { isAtMarketplaceRoot } from "#/lib/navigation/marketplace-search";
import {
  resolveVoucherNavigationOwner,
  type VoucherOrigin,
} from "#/lib/navigation/voucher-navigation-owner";
import { BottomNavigation } from "./bottom-navigation";

const ACTIVE_BOTTOM_NAV_OFFSET = "calc(4rem + env(safe-area-inset-bottom))";

export function NavigationShell() {
  const auth = useAuthStatus();
  const navOwner = useMatches({
    select: (matches) => matches.at(-1)?.staticData.navOwner,
  }) as NavOwner | undefined;
  const search: Record<string, unknown> = useSearch({ strict: false });

  if (!navOwner) {
    throw new Error("A route inside the navigation shell must declare navOwner");
  }

  let activeTab: HomeTab;
  let atActiveTabRoot = false;

  if (navOwner === "home") {
    activeTab = parseHomeTab(search.tab);
    atActiveTabRoot = activeTab === "market" ? false : isAtHomeTabRoot(search);
  } else if (navOwner === "market") {
    activeTab = "market";
    atActiveTabRoot = isAtMarketplaceRoot(search);
  } else if (navOwner === "voucher") {
    const from: VoucherOrigin | undefined =
      search.from === "market" ||
      search.from === "posts" ||
      search.from === "wallet" ||
      search.from === "vouchers"
        ? search.from
        : undefined;
    activeTab = resolveVoucherNavigationOwner({
      from,
      poolAddress: typeof search.poolAddress === "string" ? search.poolAddress : undefined,
      reportId: typeof search.reportId === "string" ? search.reportId : undefined,
    }).activeTab;
  } else {
    activeTab = navOwner;
  }

  const showNavigation =
    auth.isAuthenticated ||
    (auth.state === "sessionCheckError" &&
      !!auth.address &&
      auth.session?.address.toLowerCase() === auth.address.toLowerCase());
  const reservePendingVoucherOffset = navOwner === "voucher" && auth.isLoading;
  const bottomNavOffset =
    showNavigation || reservePendingVoucherOffset ? ACTIVE_BOTTOM_NAV_OFFSET : "0px";

  return (
    <>
      <div
        style={
          {
            "--bottom-nav-offset": bottomNavOffset,
          } as CSSProperties & Record<"--bottom-nav-offset", string>
        }
      >
        <Outlet />
      </div>
      {showNavigation ? (
        <BottomNavigation activeTab={activeTab} atActiveTabRoot={atActiveTabRoot} />
      ) : null}
    </>
  );
}
