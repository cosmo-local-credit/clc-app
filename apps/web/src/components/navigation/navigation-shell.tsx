import { Outlet, useMatches, useSearch } from "@tanstack/react-router";
import type { CSSProperties } from "react";

import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import {
  type HomeTab,
  isAtHomeTabRoot,
  parseHomeTab,
  parseMarketView,
} from "#/lib/navigation/home-tabs";
import type { NavOwner } from "#/lib/navigation/navigation-owner";
import {
  resolveVoucherNavigationOwner,
  type VoucherOrigin,
} from "#/lib/navigation/voucher-navigation-owner";
import { BottomNavigation } from "./bottom-navigation";

const BOTTOM_NAV_OFFSET = "calc(4rem + env(safe-area-inset-bottom))";

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
  const isMarketMap =
    navOwner === "home" &&
    parseHomeTab(search.tab) === "market" &&
    parseMarketView(search.view) === "map";

  if (navOwner === "home") {
    activeTab = parseHomeTab(search.tab);
    atActiveTabRoot = isAtHomeTabRoot(search);
  } else if (navOwner === "market") {
    // A list is beneath the map, which is Market's own destination.
    activeTab = "market";
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

  // A session that failed to re-check but still names this wallet keeps the
  // private tabs open; anyone else resolved as signed out sees them locked.
  const signedIn =
    auth.isAuthenticated ||
    (auth.state === "sessionCheckError" &&
      !!auth.address &&
      auth.session?.address.toLowerCase() === auth.address.toLowerCase());

  return (
    <>
      <div
        style={
          {
            "--bottom-nav-offset": BOTTOM_NAV_OFFSET,
          } as CSSProperties & Record<"--bottom-nav-offset", string>
        }
      >
        <Outlet />
      </div>
      <BottomNavigation
        activeTab={activeTab}
        atActiveTabRoot={atActiveTabRoot}
        isMarketMap={isMarketMap}
        locked={!auth.isLoading && !signedIn}
      />
    </>
  );
}
