import { Link } from "@tanstack/react-router";
import type { ComponentProps } from "react";

import type { DesktopScopeId } from "#/desktop/chrome";
import {
  marketplaceSearchForScope,
  marketplaceSharedSearch,
} from "#/lib/navigation/marketplace-search";

type LinkLook = Pick<
  ComponentProps<"a">,
  "className" | "children" | "onClick" | "aria-current" | "aria-label"
>;

/**
 * A resource destination is always its full-page list. The map is one unified
 * destination whose visible resources are controlled by the Resources chip.
 */
function marketScopeSearch(previous: unknown, scope: DesktopScopeId) {
  return {
    ...marketplaceSearchForScope(marketplaceSharedSearch(previous), scope),
    view: "list" as const,
  };
}

/** One full-page marketplace resource list. */
export function MarketScopeLink({ scope, ...props }: LinkLook & { scope: DesktopScopeId }) {
  return <Link to="/market" search={(previous) => marketScopeSearch(previous, scope)} {...props} />;
}

/**
 * The unified marketplace map. It never inherits a list scope or a remembered
 * view because the sidebar's Market destination is explicit.
 */
export function MarketHomeLink(props: LinkLook) {
  return (
    <Link
      to="/"
      search={(previous) => ({
        ...marketplaceSharedSearch(previous),
        tab: "market" as const,
        view: "map" as const,
      })}
      {...props}
    />
  );
}
