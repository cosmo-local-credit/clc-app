import { Link, useRouterState } from "@tanstack/react-router";
import type { ComponentProps } from "react";

import { type DesktopScopeId, marketViewOf } from "#/desktop/chrome";
import { resolveMarketView } from "#/desktop/market/market-view";
import {
  marketplaceSearchForScope,
  marketplaceSharedSearch,
} from "#/lib/navigation/marketplace-search";

type LinkLook = Pick<
  ComponentProps<"a">,
  "className" | "children" | "onClick" | "aria-current" | "aria-label"
>;

/**
 * Where the shell's marketplace links go. Every one keeps the Map/List choice
 * the URL already carries and never adds one: a fresh visit is the map, which
 * is what an absent `view` already means. The toolbar's own links follow the
 * same rule, so a scope is the same place however it is reached.
 */
function marketScopeSearch(previous: unknown, scope: DesktopScopeId) {
  const view = marketViewOf(previous);
  return {
    ...marketplaceSearchForScope(marketplaceSharedSearch(previous), scope),
    ...(view ? { view } : {}),
  };
}

/** One list of the marketplace, in the view the person is already using. */
export function MarketScopeLink({ scope, ...props }: LinkLook & { scope: DesktopScopeId }) {
  return <Link to="/market" search={(previous) => marketScopeSearch(previous, scope)} {...props} />;
}

/**
 * The marketplace as a whole. On the map that is the home map; in the list
 * view it is the list of everything, because the home route has no list.
 * From a screen whose URL names no view (the Wallet), it opens in the view the
 * person last used: the home map would otherwise record "map" and overwrite a
 * remembered list.
 */
export function MarketHomeLink(props: LinkLook) {
  const view = useRouterState({ select: (state) => marketViewOf(state.location.search) });
  if (resolveMarketView(view) === "list") {
    return (
      <Link
        to="/market"
        search={(previous) => ({
          ...marketplaceSearchForScope(marketplaceSharedSearch(previous), "all"),
          view: "list" as const,
        })}
        {...props}
      />
    );
  }
  return (
    <Link
      to="/"
      search={(previous) => ({
        ...marketplaceSharedSearch(previous),
        tab: "market" as const,
        ...(view ? { view } : {}),
      })}
      {...props}
    />
  );
}
