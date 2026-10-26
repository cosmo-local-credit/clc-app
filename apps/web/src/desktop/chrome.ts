export type DesktopChrome = "map" | "fill" | "fallback";

export type DesktopNavId = "market" | "wallet" | "activity" | "posts" | "settings";
export type DesktopScopeId = "offers" | "wants" | "vouchers" | "pools" | "catalogs";

const SCOPES = new Set<string>(["offers", "wants", "vouchers", "pools", "catalogs"]);

export type DesktopSearch = {
  tab?: unknown;
  scope?: unknown;
  view?: unknown;
};

function pathOf(pathname: string) {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname;
}

function scopeOf(value: unknown): DesktopScopeId | undefined {
  return typeof value === "string" && SCOPES.has(value) ? (value as DesktopScopeId) : undefined;
}

/** Which sidebar item is on, from the URL. The parent is filled only when no child is. */
export function desktopNavSelection(
  pathname: string,
  search: DesktopSearch = {},
): { nav: DesktopNavId; scope?: DesktopScopeId } {
  const path = pathOf(pathname);
  if (path === "/" || path === "") {
    if (
      search.tab === "wallet" ||
      search.tab === "activity" ||
      search.tab === "posts" ||
      search.tab === "settings"
    ) {
      return { nav: search.tab };
    }
    return { nav: "market" };
  }
  if (path === "/market") return { nav: "market", scope: scopeOf(search.scope) };
  if (
    path.startsWith("/wallet") ||
    path.startsWith("/vouchers/create") ||
    path.startsWith("/catalogs/create")
  ) {
    return { nav: "wallet" };
  }
  if (path.startsWith("/vouchers/")) return { nav: "market", scope: "vouchers" };
  if (path.startsWith("/pools")) return { nav: "market", scope: "pools" };
  if (path.startsWith("/wants")) return { nav: "market", scope: "wants" };
  if (path.startsWith("/catalogs")) return { nav: "market", scope: "catalogs" };
  if (path.startsWith("/offers")) return { nav: "market", scope: "offers" };
  if (path.startsWith("/posts")) return { nav: "posts" };
  if (path.startsWith("/settings")) return { nav: "settings" };
  return { nav: "market" };
}

/**
 * Map pages hide the top bar. Fill pages own the canvas. Anything else is the
 * mobile screen in a 430px column. `/` and `/market` decide from the URL
 * because one route serves both the map and the lists.
 */
export function desktopChrome(
  pathname: string,
  search: DesktopSearch = {},
  declared?: "fill" | "map",
): DesktopChrome {
  const path = pathOf(pathname);
  if (path === "/" || path === "") {
    return search.tab === undefined || search.tab === "market" ? "map" : "fill";
  }
  if (path === "/market") return search.view === "list" ? "fill" : "map";
  if (declared) return declared;
  return "fallback";
}

export type DeskCrumbId =
  | "market"
  | "wallet"
  | "activity"
  | "posts"
  | "settings"
  | "offers"
  | "wants"
  | "vouchers"
  | "pools"
  | "catalogs"
  | "send"
  | "receive"
  | "cash"
  | "all-vouchers"
  | "create-pool"
  | "create-voucher"
  | "create-want"
  | "create-catalog"
  | "my-posts"
  | "new-post"
  | "edit-post"
  | "profile"
  | "collect";

export function deskCrumbIds(pathname: string, search: DesktopSearch = {}): DeskCrumbId[] {
  const path = pathOf(pathname);
  if (path === "/" || path === "") {
    if (search.tab === "wallet") return ["wallet"];
    if (search.tab === "activity") return ["activity"];
    if (search.tab === "posts") return ["posts"];
    if (search.tab === "settings") return ["settings"];
    return ["market"];
  }
  if (path === "/market") {
    const scope = scopeOf(search.scope);
    return scope ? ["market", scope] : ["market"];
  }
  if (path.startsWith("/wallet/send")) return ["wallet", "send"];
  if (path.startsWith("/wallet/receive")) return ["wallet", "receive"];
  if (path.startsWith("/wallet/cash") || path.startsWith("/wallet/top-up"))
    return ["wallet", "cash"];
  if (path.startsWith("/wallet/vouchers")) return ["wallet", "all-vouchers"];
  if (path.startsWith("/wallet/collect")) return ["wallet", "collect"];
  if (path.startsWith("/wallet/wants")) return ["wallet", "create-want"];
  if (path.startsWith("/wallet")) return ["wallet"];
  if (path.startsWith("/pools/create")) return ["pools", "create-pool"];
  if (path.startsWith("/pools")) return ["pools"];
  if (path.startsWith("/vouchers/create")) return ["vouchers", "create-voucher"];
  if (path.startsWith("/vouchers")) return ["vouchers"];
  if (path.startsWith("/posts/mine")) return ["posts", "my-posts"];
  if (path.startsWith("/posts/new")) return ["posts", "new-post"];
  if (path.endsWith("/edit") && path.startsWith("/posts/")) return ["posts", "edit-post"];
  if (path.startsWith("/posts")) return ["posts"];
  if (path.startsWith("/settings/profile")) return ["settings", "profile"];
  if (path.startsWith("/settings")) return ["settings"];
  if (path.startsWith("/catalogs/create")) return ["wallet", "create-catalog"];
  if (path.startsWith("/catalogs")) return ["catalogs"];
  if (path.startsWith("/wants")) return ["wants"];
  return ["market"];
}
